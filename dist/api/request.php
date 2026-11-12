<?php
// Приём «Заявки с фото» (js/request.js) на meatwash.ru — хостинг reg.ru, PHP 8.0+.
//
// В ЭТОМ ФАЙЛЕ НЕТ И НЕ ДОЛЖНО БЫТЬ СЕКРЕТОВ: он лежит в публичном репозитории, а GitHub
// Pages отдаёт его как обычный текст (`npm run check` ищет здесь токены и адреса почты).
// Получатели, токен бота и секрет подписи — в файле настроек ВНЕ папки сайта и вне
// репозитория:
//   1) путь из переменной окружения MEATWASH_REQUEST_CONFIG, иначе
//   2) <папка, где лежит папка сайта>/meatwash-private/request-config.php
//      (на reg.ru: ~/www/meatwash.ru/api/request.php → ~/www/meatwash-private/request-config.php).
// Образец — server/request-config.example.php; как включить — README, «Заявка с фото на meatwash.ru».
//
// Протокол (только POST, ответ всегда JSON):
//   action=token → {"ok":true,"token":"…","wait":N} — подписанная метка времени, форма
//                  получает её при открытии окна и отправляет не раньше чем через N секунд;
//   заявка (multipart/form-data): services, topic_id, name, contact, car, branch, comment,
//                  consent=yes, consentDocument, page, token, mw_extra (ловушка, пустое),
//                  photos[] (до 5) → {"ok":true} | {"ok":false,"error":"…"}.
//   Коды: 400 — ошибка в данных, 405 — не POST, 413 — слишком большой файл или запрос,
//   415 — не картинка, 429 — слишком часто, 503 — не настроено, 500 — не удалось доставить.
//
// Персональные данные не хранятся: фото читаются из временных файлов PHP (удаляются
// после запроса), в журнал пишутся только технические причины ошибок, для ограничения
// частоты — HMAC от IP, а не сам адрес.

declare(strict_types=1);

ini_set('display_errors', '0');

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILES * MAX_FILE_BYTES + 1024 * 1024;
// Тип — по содержимому файла, расширение для вложения — наше.
const TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/heic' => 'heic', 'image/heif' => 'heif'];
// Поля формы: [наибольшая длина, обязательное, многострочное].
const FIELDS = [
    'name' => [80, true, false],
    'contact' => [100, true, false],
    'car' => [120, false, false],
    'branch' => [60, false, false],
    'comment' => [1000, false, true],
];
// Студии (поле branch — id из формы) и их названия в тексте заявки.
const BRANCHES = ['myasnitskaya' => 'Лубянка', 'technopark' => 'Технопарк'];
const MAX_SERVICES = 30;
const MAX_SERVICE_LENGTH = 200;

// ── Ответ ───────────────────────────────────────────────────────────────────

function respond(int $status, array $body, array $headers = []): void
{
    if (!headers_sent()) {
        http_response_code($status);
        header_remove('X-Powered-By');
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        foreach ($headers as $header) {
            header($header);
        }
    }
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $error, array $extra = [], array $headers = []): void
{
    respond($status, ['ok' => false, 'error' => $error] + $extra, $headers);
}

// Журнал — без персональных данных: только техническая причина.
function note(string $message): void
{
    error_log('meatwash request: ' . $message);
}

function mb(int $bytes): string
{
    return rtrim(rtrim(number_format($bytes / 1024 / 1024, 1, ',', ''), '0'), ',') . ' МБ';
}

// Размер из php.ini (например «10M») в байтах.
function iniBytes(string $key): int
{
    $value = trim((string) ini_get($key));
    if ($value === '' || $value === '-1' || $value === '0') {
        return PHP_INT_MAX;
    }
    $number = (int) $value;
    switch (strtolower(substr($value, -1))) {
        case 'g': return $number * 1024 * 1024 * 1024;
        case 'm': return $number * 1024 * 1024;
        case 'k': return $number * 1024;
        default: return $number;
    }
}

// ── Настройки ───────────────────────────────────────────────────────────────

function configPath(): string
{
    $fromEnv = getenv('MEATWASH_REQUEST_CONFIG');
    if (is_string($fromEnv) && $fromEnv !== '') {
        return $fromEnv;
    }
    if (!empty($_SERVER['MEATWASH_REQUEST_CONFIG']) && is_string($_SERVER['MEATWASH_REQUEST_CONFIG'])) {
        return $_SERVER['MEATWASH_REQUEST_CONFIG'];
    }
    return dirname(__DIR__, 2) . '/meatwash-private/request-config.php';
}

function validEmail($value): bool
{
    if (!is_string($value) || filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
        return false;
    }
    // Заглушки из образца — не адрес.
    return !preg_match('/@(example\.(com|org|net)|example)$/i', $value);
}

// Возвращает настройки с включёнными каналами или null (ответ 503).
function loadConfig(): ?array
{
    if (!function_exists('mb_strlen')) {
        note('mbstring extension is missing');
        return null;
    }
    $path = configPath();
    if (!is_file($path) || !is_readable($path)) {
        note('config not found (see README: «Заявка с фото на meatwash.ru»)');
        return null;
    }
    try {
        $config = (static function (string $file) {
            return require $file;
        })($path);
    } catch (Throwable $error) {
        note('config error: ' . get_class($error) . ' at line ' . $error->getLine());
        return null;
    }
    if (!is_array($config)) {
        note('config must return an array');
        return null;
    }
    $secret = $config['secret'] ?? '';
    if (!is_string($secret) || strlen($secret) < 32 || strpos($secret, 'ЗАМЕНИТЕ') !== false) {
        note('config: secret is missing, a placeholder or too short (need 32+ random characters)');
        return null;
    }

    $channels = [];
    $mail = $config['mail'] ?? [];
    if (!empty($mail['enabled'])) {
        $to = array_values(array_filter((array) ($mail['to'] ?? []), 'validEmail'));
        if ($to && validEmail($mail['from'] ?? null)) {
            $channels['mail'] = [
                'to' => $to,
                'from' => $mail['from'],
                'from_name' => is_string($mail['from_name'] ?? null) ? $mail['from_name'] : 'Сайт Meat Wash',
                'letter_bytes' => max(1, (int) ($mail['max_letter_mb'] ?? 18)) * 1024 * 1024,
            ];
        } else {
            note('config: mail enabled, but "to" or "from" is not a real address');
        }
    }
    $telegram = $config['telegram'] ?? [];
    if (!empty($telegram['enabled'])) {
        $token = (string) ($telegram['token'] ?? '');
        $chat = (string) ($telegram['chat_id'] ?? '');
        if (preg_match('/^\d{5,}:[\w-]{30,}$/', $token) && preg_match('/^(-?\d+|@\w{5,})$/', $chat)) {
            $channels['telegram'] = [
                'token' => $token,
                'chat_id' => $chat,
                'api' => rtrim(is_string($telegram['api_base'] ?? null) && $telegram['api_base'] !== '' ? $telegram['api_base'] : 'https://api.telegram.org', '/'),
            ];
        } else {
            note('config: telegram enabled, but token or chat_id is not set');
        }
    }
    // YCLIENTS (Влад 12.11: «заявка должна падать в YCLIENTS») — заявка в «Лист ожидания» студии.
    $yc = $config['yclients'] ?? [];
    if (!empty($yc['enabled'])) {
        $partner = (string) ($yc['partner_token'] ?? '');
        $user = (string) ($yc['user_token'] ?? '');
        $companies = array_filter(array_map('intval', (array) ($yc['companies'] ?? [])));
        $default = (string) ($yc['default_branch'] ?? '');
        $fallback = array_map('intval', (array) ($yc['fallback_service'] ?? []));
        $missing = array_diff_key($companies, array_filter($fallback, static function ($id) { return $id > 0; }));
        if ($missing) {
            note('config: yclients fallback_service is not set for ' . implode(', ', array_keys($missing)) . ' — channel is off');
        } elseif (preg_match('/^[A-Za-z0-9]{10,}$/', $partner) && preg_match('/^[A-Za-z0-9]{10,}$/', $user)
            && $companies && isset($companies[$default]) && !array_diff_key($companies, BRANCHES)) {
            $channels['yclients'] = [
                'partner' => $partner,
                'user' => $user,
                'companies' => $companies,
                'default_branch' => $default,
                'topic_branch' => array_filter((array) ($yc['topic_branch'] ?? []), static function ($b) use ($companies) { return isset($companies[$b]); }),
                'fallback_service' => $fallback,
                'map_file' => is_string($yc['map_file'] ?? null) && $yc['map_file'] !== '' ? $yc['map_file'] : dirname(__DIR__) . '/assets/yclients.json',
                'api' => rtrim(is_string($yc['api_base'] ?? null) && $yc['api_base'] !== '' ? $yc['api_base'] : 'https://api.yclients.ru', '/'),
            ];
        } elseif (!$missing) {
            note('config: yclients enabled, but tokens, companies or default_branch are not set');
        }
    }
    // Только для проверки: письмо сохраняется в папку вместо отправки (в работе — выключено).
    $file = $config['file'] ?? [];
    if (!empty($file['enabled']) && is_string($file['dir'] ?? null) && $file['dir'] !== '') {
        $channels['file'] = ['dir' => $file['dir']];
    }
    if (!$channels) {
        note('config: no delivery channel is enabled');
        return null;
    }

    $antispam = $config['antispam'] ?? [];
    return [
        'secret' => $secret,
        'channels' => $channels,
        'min_seconds' => max(0, (int) ($antispam['min_seconds'] ?? 4)),
        'max_age' => max(1, (int) ($antispam['max_age_hours'] ?? 24)) * 3600,
        'rate_limit' => max(1, (int) ($antispam['rate_limit'] ?? 5)),
        'rate_window' => max(1, (int) ($antispam['rate_window_minutes'] ?? 60)) * 60,
        'data_dir' => is_string($config['data_dir'] ?? null) && $config['data_dir'] !== '' ? $config['data_dir'] : dirname($path) . '/data',
    ];
}

// ── Антиспам: подписанная метка времени, ограничение частоты ────────────────

function issueToken(string $secret): string
{
    $payload = time() . '.' . bin2hex(random_bytes(8));
    return $payload . '.' . hash_hmac('sha256', 'request-token|' . $payload, $secret);
}

// null — метка в порядке; иначе [код, текст, нужна ли новая метка].
function tokenProblem($token, array $config): ?array
{
    if (!is_string($token) || !preg_match('/^(\d{10})\.([0-9a-f]{16})\.([0-9a-f]{64})$/', $token, $m)) {
        return [400, 'форма устарела', true];
    }
    if (!hash_equals(hash_hmac('sha256', 'request-token|' . $m[1] . '.' . $m[2], $config['secret']), $m[3])) {
        return [400, 'форма устарела', true];
    }
    $age = time() - (int) $m[1];
    if ($age < -60 || $age > $config['max_age']) {
        return [400, 'форма устарела', true];
    }
    if ($age < $config['min_seconds']) {
        return [400, 'заявка отправлена слишком быстро', false];
    }
    return null;
}

function dataDir(array $config): ?string
{
    foreach ([$config['data_dir'], rtrim(sys_get_temp_dir(), '/\\') . '/meatwash-request'] as $dir) {
        if ((is_dir($dir) || @mkdir($dir, 0700, true)) && is_writable($dir)) {
            return $dir;
        }
    }
    return null;
}

// Сколько секунд ждать (0 — можно). $record — засчитать эту отправку.
function rateLimit(array $config, bool $record): int
{
    $dir = dataDir($config);
    if ($dir === null) {
        note('rate limit: no writable data dir, limit is off');
        return 0;
    }
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $file = $dir . '/rl-' . substr(hash_hmac('sha256', 'ip|' . $ip, $config['secret']), 0, 32);
    $now = time();
    $window = $config['rate_window'];
    $handle = @fopen($file, 'c+');
    if (!$handle) {
        note('rate limit: cannot open data file');
        return 0;
    }
    flock($handle, LOCK_EX);
    $times = array_values(array_filter(
        array_map('intval', explode(',', (string) stream_get_contents($handle))),
        static function (int $t) use ($now, $window) { return $t > $now - $window; }
    ));
    $wait = count($times) >= $config['rate_limit'] ? max(1, min($times) + $window - $now) : 0;
    if ($record && $wait === 0) {
        $times[] = $now;
    }
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, implode(',', $times));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    // Изредка убираем записи тех, кто давно не отправлял.
    if (random_int(1, 50) === 1) {
        foreach (glob($dir . '/rl-*') ?: [] as $old) {
            if (@filemtime($old) < $now - $window) {
                @unlink($old);
            }
        }
    }
    return $wait;
}

// ── Поля и фото ─────────────────────────────────────────────────────────────

// Строка без управляющих символов и направляющих меток Unicode; \n — только в многострочных.
function clean($value, bool $multiline): ?string
{
    if (!is_string($value)) {
        return '';
    }
    if (!mb_check_encoding($value, 'UTF-8')) {
        return null;
    }
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $value = str_replace("\t", ' ', $value);
    if (!$multiline) {
        $value = str_replace("\n", ' ', $value);
    }
    $value = (string) preg_replace('/[\x00-\x09\x0B-\x1F\x7F\x{200E}\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', '', $value);
    return trim($value);
}

function readFields(): array
{
    $data = [];
    foreach (FIELDS as $name => [$max, $required, $multiline]) {
        $value = clean($_POST[$name] ?? '', $multiline);
        if ($value === null) {
            fail(400, 'текст заявки не в кодировке UTF-8', ['field' => $name]);
        }
        if ($required && $value === '') {
            fail(400, $name === 'name' ? 'не указано имя' : 'не указан телефон или Telegram', ['field' => $name]);
        }
        if (mb_strlen($value, 'UTF-8') > $max) {
            fail(400, "поле слишком длинное (до $max символов)", ['field' => $name]);
        }
        $data[$name] = $value;
    }
    if (mb_strlen($data['contact'], 'UTF-8') < 5) {
        fail(400, 'укажите телефон или ник в Telegram, чтобы мастер мог ответить', ['field' => 'contact']);
    }
    // branch — id студии из формы (myasnitskaya, technopark) или пусто; в тексте — название.
    $data['branch_id'] = isset(BRANCHES[$data['branch']]) ? $data['branch'] : '';
    $data['branch'] = $data['branch_id'] !== '' ? BRANCHES[$data['branch_id']] : ($data['branch'] === '' ? 'Любая' : $data['branch']);
    $body = clean($_POST['body'] ?? '', false);
    $data['body'] = is_string($body) && preg_match('/^[0-3]$/', $body) ? (int) $body : 0;
    $topic = clean($_POST['topic_id'] ?? '', false);
    $data['topic_id'] = is_string($topic) && preg_match('/^[a-z]{1,20}$/', $topic) ? $topic : '';

    $services = clean($_POST['services'] ?? '', true);
    if ($services === null) {
        fail(400, 'текст заявки не в кодировке UTF-8', ['field' => 'services']);
    }
    $list = array_values(array_unique(array_filter(array_map('trim', explode("\n", $services)), 'strlen')));
    if (!$list) {
        fail(400, 'не выбрано ни одной работы', ['field' => 'services']);
    }
    if (count($list) > MAX_SERVICES) {
        fail(400, 'слишком много работ в одной заявке (до ' . MAX_SERVICES . ')', ['field' => 'services']);
    }
    foreach ($list as $service) {
        if (mb_strlen($service, 'UTF-8') > MAX_SERVICE_LENGTH) {
            fail(400, 'слишком длинное название работы', ['field' => 'services']);
        }
    }
    $data['services'] = $list;

    if (($_POST['consent'] ?? '') !== 'yes') {
        fail(400, 'без согласия на обработку персональных данных заявку не отправить', ['field' => 'consent']);
    }
    // Справочно: на какой странице и с каким документом согласия отправлено.
    foreach (['consentDocument', 'page'] as $name) {
        $url = clean($_POST[$name] ?? '', false);
        $data[$name] = $url !== null && strlen($url) <= 300 && preg_match('~^https?://[^\s<>"]+$~i', $url) ? $url : '';
    }
    return $data;
}

// Тип файла по содержимому: finfo, а если его нет или он не знает HEIC — сигнатуры.
function detectType(string $path): ?string
{
    if (class_exists('finfo')) {
        $type = (new finfo(FILEINFO_MIME_TYPE))->file($path);
        if (is_string($type) && isset(TYPES[$type])) {
            return $type;
        }
    }
    $head = (string) file_get_contents($path, false, null, 0, 64);
    if (strncmp($head, "\xFF\xD8\xFF", 3) === 0) {
        return 'image/jpeg';
    }
    if (strncmp($head, "\x89PNG\r\n\x1A\n", 8) === 0) {
        return 'image/png';
    }
    if (strncmp($head, 'RIFF', 4) === 0 && substr($head, 8, 4) === 'WEBP') {
        return 'image/webp';
    }
    if (substr($head, 4, 4) === 'ftyp') {
        // ISO BMFF: основной бренд и совместимые (до конца бокса ftyp).
        $major = substr($head, 8, 4);
        if (in_array($major, ['avif', 'avis'], true)) {
            return null;
        }
        $size = min(64, unpack('N', substr($head, 0, 4))[1]);
        $brands = [$major];
        for ($i = 16; $i + 4 <= $size; $i += 4) {
            $brands[] = substr($head, $i, 4);
        }
        if (array_intersect($brands, ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'])) {
            return 'image/heic';
        }
        if (array_intersect($brands, ['mif1', 'msf1'])) {
            return 'image/heif';
        }
    }
    return null;
}

function readPhotos(): array
{
    $raw = $_FILES['photos'] ?? null;
    if ($raw === null) {
        return [];
    }
    if (!is_array($raw['name'] ?? null)) {
        $raw = array_map(static function ($v) { return [$v]; }, $raw);
    }
    $limit = min(MAX_FILE_BYTES, iniBytes('upload_max_filesize'));
    $sent = array_filter((array) $raw['error'], static function ($error) { return (int) $error !== UPLOAD_ERR_NO_FILE; });
    if (count($sent) > MAX_FILES) {
        fail(400, 'не больше ' . MAX_FILES . ' фото в одной заявке', ['field' => 'photos']);
    }
    $photos = [];
    foreach (array_keys($raw['name']) as $i) {
        $error = (int) ($raw['error'][$i] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        $number = count($photos) + 1;
        if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
            fail(413, "фото $number больше " . mb($limit) . ' — уменьшите его или отправьте другое', ['field' => 'photos']);
        }
        if ($error !== UPLOAD_ERR_OK) {
            note("upload error $error");
            fail($error === UPLOAD_ERR_PARTIAL ? 400 : 500, "фото $number не загрузилось — попробуйте ещё раз", ['field' => 'photos']);
        }
        $tmp = (string) $raw['tmp_name'][$i];
        if (!is_uploaded_file($tmp)) {
            fail(400, "фото $number не загрузилось — попробуйте ещё раз", ['field' => 'photos']);
        }
        $size = (int) filesize($tmp);
        if ($size === 0) {
            fail(415, "фото $number пустое — выберите другой файл", ['field' => 'photos']);
        }
        if ($size > MAX_FILE_BYTES) {
            fail(413, "фото $number — " . mb($size) . ', а можно до ' . mb(MAX_FILE_BYTES), ['field' => 'photos']);
        }
        $type = detectType($tmp);
        if ($type === null) {
            fail(415, "файл $number — не фото: нужен JPG, PNG, WebP или HEIC", ['field' => 'photos']);
        }
        $photos[] = ['path' => $tmp, 'size' => $size, 'type' => $type, 'name' => 'photo-' . $number . '.' . TYPES[$type]];
    }
    return $photos;
}

// ── Текст заявки ────────────────────────────────────────────────────────────

function lines(array $data, int $photoCount): array
{
    $now = new DateTimeImmutable('now', new DateTimeZone('Europe/Moscow'));
    return [
        'Работы' => implode("\n", $data['services']),
        'Имя' => $data['name'],
        'Контакт' => $data['contact'],
        'Автомобиль' => $data['car'] !== '' ? $data['car'] : '—',
        'Студия' => $data['branch'],
        'Комментарий' => $data['comment'] !== '' ? $data['comment'] : '—',
        'Фото' => $photoCount ? (string) $photoCount : 'нет',
        'Согласие на обработку ПДн' => 'дано' . ($data['consentDocument'] !== '' ? ' (' . $data['consentDocument'] . ')' : ''),
        'Страница' => $data['page'] !== '' ? $data['page'] : '—',
        'Получено' => $now->format('d.m.Y H:i') . ' МСК',
    ];
}

function plainText(array $lines, string $title): string
{
    $text = $title . "\n\n";
    foreach ($lines as $label => $value) {
        $text .= strpos($value, "\n") !== false
            ? $label . ":\n  " . str_replace("\n", "\n  ", $value) . "\n"
            : $label . ': ' . $value . "\n";
    }
    return $text;
}

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

// Ссылка для ответа: телефон — tel:, ник — t.me. Адрес собирается только из проверенных символов.
function contactLink(string $contact): string
{
    $digits = preg_replace('/\D+/', '', $contact);
    if (preg_match('/^[\d\s()+\-.]+$/', $contact) && strlen($digits) >= 10 && strlen($digits) <= 15) {
        if (strlen($digits) === 11 && $digits[0] === '8') {
            $digits = '7' . substr($digits, 1);
        }
        return '<a href="tel:+' . $digits . '">' . e($contact) . '</a>';
    }
    if (preg_match('/^@?([A-Za-z][A-Za-z0-9_]{4,31})$/', $contact, $m)) {
        return '<a href="https://t.me/' . $m[1] . '">' . e($contact) . '</a>';
    }
    return e($contact);
}

function htmlText(array $lines, string $title, string $contact): string
{
    $rows = '';
    foreach ($lines as $label => $value) {
        $cell = $label === 'Контакт' ? contactLink($contact) : nl2br(e($value), false);
        $rows .= '<tr><th align="left" valign="top" style="padding:4px 12px 4px 0;color:#555;font-weight:normal">' . e($label)
            . '</th><td valign="top" style="padding:4px 0">' . $cell . '</td></tr>';
    }
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>' . e($title) . '</title></head>'
        . '<body style="font-family:Arial,sans-serif;font-size:15px;color:#111"><h2 style="font-size:18px">' . e($title) . '</h2>'
        . '<table cellspacing="0" cellpadding="0">' . $rows . '</table></body></html>';
}

// ── Каналы доставки ─────────────────────────────────────────────────────────

// Фото по письмам: каждое письмо не больше letter_bytes вложений (почтовые серверы
// не принимают слишком большие письма); в каждом — полный текст заявки.
function letterGroups(array $photos, int $limit): array
{
    $groups = [[]];
    $size = 0;
    foreach ($photos as $photo) {
        $last = count($groups) - 1;
        if ($groups[$last] && $size + $photo['size'] > $limit) {
            $groups[] = [];
            $last++;
            $size = 0;
        }
        $groups[$last][] = $photo;
        $size += $photo['size'];
    }
    return $groups;
}

function encodeHeader(string $value): string
{
    return mb_encode_mimeheader(str_replace(["\r", "\n"], ' ', $value), 'UTF-8', 'B', "\r\n");
}

// Письма: [['to' => …, 'subject' => …, 'headers' => [...], 'body' => …], …]
function composeLetters(array $data, array $photos, array $mail): array
{
    $groups = letterGroups($photos, $mail['letter_bytes']);
    $total = count($groups);
    $lines = lines($data, count($photos));
    $letters = [];
    $first = 1;
    foreach ($groups as $n => $group) {
        $part = $total > 1 ? ' (письмо ' . ($n + 1) . ' из ' . $total . ')' : '';
        $title = 'Заявка с сайта: ' . mb_substr($data['name'], 0, 40, 'UTF-8') . $part;
        $last = $first + count($group) - 1;
        $note = $group ? 'Фото ' . ($first === $last ? $first : $first . '–' . $last) . ' из ' . count($photos) . ' — во вложении.' : '';
        $first += count($group);
        $mixed = 'mw-' . bin2hex(random_bytes(12));
        $alt = 'mw-' . bin2hex(random_bytes(12));
        $body = "This is a multi-part message in MIME format.\r\n\r\n"
            . "--$mixed\r\nContent-Type: multipart/alternative; boundary=\"$alt\"\r\n\r\n"
            . "--$alt\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode(plainText($lines, $title) . ($note ? "\n" . $note . "\n" : '')), 76, "\r\n")
            . "--$alt\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode(htmlText($lines, $title, $data['contact']) . ($note ? '<p>' . e($note) . '</p>' : '')), 76, "\r\n")
            . "--$alt--\r\n";
        foreach ($group as $photo) {
            $body .= "--$mixed\r\nContent-Type: {$photo['type']}; name=\"{$photo['name']}\"\r\n"
                . "Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"{$photo['name']}\"\r\n\r\n"
                . chunk_split(base64_encode((string) file_get_contents($photo['path'])), 76, "\r\n");
        }
        $body .= "--$mixed--\r\n";
        $letters[] = [
            'to' => implode(', ', $mail['to']),
            'subject' => encodeHeader($title),
            'headers' => [
                'From' => encodeHeader($mail['from_name']) . ' <' . $mail['from'] . '>',
                'MIME-Version' => '1.0',
                'Content-Type' => "multipart/mixed; boundary=\"$mixed\"",
                'X-Mailer' => 'meatwash.ru request form',
            ],
            'body' => $body,
        ];
    }
    return $letters;
}

function sendMail(array $data, array $photos, array $mail): bool
{
    foreach (composeLetters($data, $photos, $mail) as $i => $letter) {
        if (!mail($letter['to'], $letter['subject'], $letter['body'], $letter['headers'], '-f' . $mail['from'])) {
            note('mail(): letter ' . ($i + 1) . ' was not accepted by the local mail server');
            return false;
        }
    }
    return true;
}

// Для проверки без почты: те же письма — файлами .eml.
function saveFiles(array $data, array $photos, array $file): bool
{
    $dir = $file['dir'];
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        note('file channel: cannot create dir');
        return false;
    }
    $mail = ['to' => ['file-channel@localhost'], 'from' => 'file-channel@localhost', 'from_name' => 'Сайт Meat Wash', 'letter_bytes' => 18 * 1024 * 1024];
    $stamp = date('Ymd-His') . '-' . bin2hex(random_bytes(3));
    foreach (composeLetters($data, $photos, $mail) as $i => $letter) {
        $headers = 'To: ' . $letter['to'] . "\r\nSubject: " . $letter['subject'] . "\r\n";
        foreach ($letter['headers'] as $name => $value) {
            $headers .= "$name: $value\r\n";
        }
        if (file_put_contents("$dir/$stamp-" . ($i + 1) . '.eml', $headers . "\r\n" . $letter['body']) === false) {
            note('file channel: cannot write');
            return false;
        }
    }
    return true;
}

function telegramCall(array $tg, string $method, array $fields): bool
{
    if (!function_exists('curl_init')) {
        note('telegram: curl extension is missing');
        return false;
    }
    $curl = curl_init($tg['api'] . '/bot' . $tg['token'] . '/' . $method);
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $fields,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 90,
    ]);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $curlError = curl_errno($curl);
    curl_close($curl);
    $result = is_string($response) ? json_decode($response, true) : null;
    if ($status === 200 && is_array($result) && ($result['ok'] ?? false) === true) {
        return true;
    }
    // Ни адреса с токеном, ни текста заявки в журнал не пишем.
    $description = is_array($result) && is_string($result['description'] ?? null) ? mb_substr($result['description'], 0, 120, 'UTF-8') : '';
    note("telegram $method failed: HTTP $status, curl $curlError" . ($description !== '' ? ", $description" : ''));
    return false;
}

function sendTelegram(array $data, array $photos, array $tg): bool
{
    $text = plainText(lines($data, count($photos)), 'Заявка с сайта meatwash.ru');
    if (mb_strlen($text, 'UTF-8') > 4000) {
        $text = mb_substr($text, 0, 3990, 'UTF-8') . "\n…";
    }
    if (!telegramCall($tg, 'sendMessage', ['chat_id' => $tg['chat_id'], 'text' => $text, 'disable_web_page_preview' => 'true'])) {
        return false;
    }
    if (!$photos) {
        return true;
    }
    // Документами, а не сжатыми фото: так доходят оригиналы и HEIC.
    $file = static function (array $photo) { return new CURLFile($photo['path'], $photo['type'], $photo['name']); };
    if (count($photos) === 1) {
        $sent = telegramCall($tg, 'sendDocument', ['chat_id' => $tg['chat_id'], 'document' => $file($photos[0])]);
    } else {
        $fields = ['chat_id' => $tg['chat_id']];
        $media = [];
        foreach ($photos as $i => $photo) {
            $media[] = ['type' => 'document', 'media' => "attach://photo$i"];
            $fields["photo$i"] = $file($photo);
        }
        $fields['media'] = json_encode($media);
        $sent = telegramCall($tg, 'sendMediaGroup', $fields);
    }
    if (!$sent) {
        telegramCall($tg, 'sendMessage', ['chat_id' => $tg['chat_id'], 'text' => 'Фото к заявке выше не передались. Клиенту показана ошибка — он может отправить заявку ещё раз.']);
    }
    return $sent;
}

// ── YCLIENTS: клиент по телефону и заявка в листе ожидания ───────────────────
// Документация: https://developers.yclients.com/ru/ — заголовок «Bearer <partner>, User <user>»,
// Accept application/vnd.yclients.v2+json. Порядок: студия → услуги по assets/yclients.json →
// клиент (поиск по телефону, иначе создание) → POST /api/v2/companies/{id}/waiting_list.
// В журнал — только метод, путь без параметров и код ответа (ни телефона, ни имени, ни токенов).

function ycCall(array $yc, string $method, string $path, ?array $body = null): ?array
{
    if (!function_exists('curl_init')) {
        note('yclients: curl extension is missing');
        return null;
    }
    $curl = curl_init($yc['api'] . $path);
    $options = [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'Accept: application/vnd.yclients.v2+json',
            'Content-Type: application/json',
            'Authorization: Bearer ' . $yc['partner'] . ', User ' . $yc['user'],
        ],
    ];
    if ($body !== null) {
        $options[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE);
    }
    curl_setopt_array($curl, $options);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $curlError = curl_errno($curl);
    $result = is_string($response) ? json_decode($response, true) : null;
    if ($status >= 200 && $status < 300 && is_array($result) && ($result['success'] ?? true) !== false) {
        return $result;
    }
    $message = is_array($result) && is_string($result['meta']['message'] ?? null) ? mb_substr($result['meta']['message'], 0, 120, 'UTF-8') : '';
    note('yclients ' . $method . ' ' . preg_replace('/\?.*$/', '', $path) . ": HTTP $status, curl $curlError" . ($message !== '' ? ", $message" : ''));
    return null;
}

function ycPhone(string $contact): string
{
    $digits = preg_replace('/\D/', '', $contact);
    // Иностранный номер (+ и не +7) — как есть, 10–15 цифр.
    if (preg_match('/^\s*\+\s*[0-689]/', $contact)) {
        return strlen($digits) >= 10 && strlen($digits) <= 15 ? $digits : '';
    }
    if (strlen($digits) === 11 && $digits[0] === '8') {
        $digits = '7' . substr($digits, 1);
    } elseif (strlen($digits) === 10) {
        $digits = '7' . $digits;
    }
    return preg_match('/^7\d{10}$/', $digits) ? $digits : '';
}

function ycBranch(array $data, array $yc): string
{
    $topic = $data['topic_id'];
    if ($topic !== '' && isset($yc['topic_branch'][$topic])) {
        return $yc['topic_branch'][$topic];
    }
    if ($data['branch_id'] !== '' && isset($yc['companies'][$data['branch_id']])) {
        return $data['branch_id'];
    }
    return $yc['default_branch'];
}

// Услуги YCLIENTS студии по названиям работ: позиции (items) и программы мойки (programs —
// по кузову; берём первую услугу, что есть в студии). Нет ни одной — запасная услуга студии.
function ycServices(array $names, string $branch, array $yc, int $body = 0, bool $fallback = true): array
{
    static $cache = null;
    $map = $cache ??= (is_file($yc['map_file']) ? json_decode((string) file_get_contents($yc['map_file']), true) : null);
    $ids = [];
    if (is_array($map)) {
        $programs = [];
        foreach ((array) ($map['programs'] ?? []) as $program) {
            if (is_string($program['name'] ?? null)) {
                $programs[$program['name']] = (array) ($program[$branch] ?? []);
            }
        }
        foreach ($names as $name) {
            $id = $map['items'][$name][$branch] ?? null;
            if (!$id && isset($programs[$name])) {
                $id = ($programs[$name][$body] ?? null) ?: (current(array_filter($programs[$name])) ?: null);
            }
            if (is_int($id) || ctype_digit((string) $id)) {
                $ids[] = (int) $id;
            }
        }
    } else {
        note('yclients: service map is missing or broken');
    }
    $ids = array_values(array_unique(array_filter($ids)));
    if (!$ids && $fallback && !empty($yc['fallback_service'][$branch])) {
        $ids = [(int) $yc['fallback_service'][$branch]];
    }
    return $ids;
}

// [id, имя]: найденный по телефону — со своим именем из базы (имя в листе ожидания перезаписывает
// карточку, поэтому форма имя существующего клиента не меняет); новый — с именем из формы и без
// SMS-рассылок (согласие на рекламу посетитель не давал).
function ycClient(array $yc, int $company, string $phone, string $name): ?array
{
    $found = ycCall($yc, 'GET', "/api/v1/clients/$company?" . http_build_query(['phone' => $phone, 'count' => 20]));
    foreach ((array) ($found['data'] ?? []) as $client) {
        if (is_array($client) && preg_replace('/\D/', '', (string) ($client['phone'] ?? '')) === $phone && (int) ($client['id'] ?? 0) > 0) {
            $stored = trim((string) ($client['name'] ?? ''));
            return [(int) $client['id'], $stored !== '' ? $stored : $name];
        }
    }
    $made = ycCall($yc, 'POST', "/api/v1/clients/$company", ['name' => $name, 'phone' => $phone, 'comment' => 'Заявка с сайта meatwash.ru', 'sms_not' => 1]);
    $id = (int) ($made['data']['id'] ?? $made['id'] ?? 0);
    return $id > 0 ? [$id, $name] : null;
}

function sendYclients(array $data, array $yc): bool
{
    $phone = ycPhone($data['contact']);
    if ($phone === '') {
        note('yclients: contact is not a Russian phone number');
        return false;
    }
    $branch = ycBranch($data, $yc);
    $services = ycServices($data['services'], $branch, $yc, $data['body'], false);
    // Работы этой студии нет, а в другой есть (например, «Трёхфазная» — только Технопарк) — туда.
    if (!$services && !isset($yc['topic_branch'][$data['topic_id']])) {
        foreach (array_keys($yc['companies']) as $other) {
            if ($other !== $branch && ycServices($data['services'], $other, $yc, $data['body'], false)) {
                $branch = $other;
                break;
            }
        }
    }
    $company = (int) $yc['companies'][$branch];
    $services = ycServices($data['services'], $branch, $yc, $data['body']);
    if (!$services) {
        note("yclients: no service id for the request in $branch (set fallback_service)");
        return false;
    }
    $client = ycClient($yc, $company, $phone, $data['name']);
    if ($client === null) {
        return false;
    }
    // Комментарий: сначала слова клиента и «о чём заявка», потом работы и остальное — если YCLIENTS
    // где-то обрежет текст, пропадёт хвост, а не сам запрос.
    $text = ['Заявка с сайта meatwash.ru', ''];
    if ($data['comment'] !== '') {
        $text[] = 'Комментарий: ' . $data['comment'];
    }
    $text[] = 'Работы: ' . implode('; ', $data['services']);
    $text[] = 'Имя в заявке: ' . $data['name'] . ', телефон: ' . $data['contact'];
    $text[] = 'Студия: ' . BRANCHES[$branch];
    if ($data['page'] !== '') {
        $text[] = 'Страница: ' . $data['page'];
    }
    $text[] = 'Согласие на обработку ПДн: дано';
    $comment = implode("\n", $text);
    if (mb_strlen($comment, 'UTF-8') > 3000) {
        $comment = mb_substr($comment, 0, 2990, 'UTF-8') . "\n…";
    }
    $entry = ycCall($yc, 'POST', "/api/v2/companies/$company/waiting_list", [
        'comment' => $comment,
        'client' => ['id' => $client[0], 'name' => $client[1], 'phone' => $phone, 'surname' => null, 'patronymic' => null],
        'service_ids' => $services,
    ]);
    return $entry !== null && !empty($entry['data']['id']);
}

// ── Запрос ──────────────────────────────────────────────────────────────────

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        fail(405, 'заявки принимаются только из формы на сайте', [], ['Allow: POST']);
    }
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    $postLimit = min(MAX_REQUEST_BYTES, iniBytes('post_max_size'));
    if ($length > $postLimit) {
        fail(413, 'фото вместе больше ' . mb($postLimit) . ' — уберите часть фото или отправьте их поменьше', ['field' => 'photos']);
    }

    $config = loadConfig();
    if ($config === null) {
        fail(503, 'приём заявок на сайте временно не работает');
    }

    if (($_POST['action'] ?? '') === 'token') {
        respond(200, ['ok' => true, 'token' => issueToken($config['secret']), 'wait' => $config['min_seconds']]);
    }

    // Ловушка: скрытое поле, которое человек не видит и не заполняет.
    if (trim((string) ($_POST['mw_extra'] ?? '')) !== '') {
        fail(400, 'заявка похожа на автоматическую');
    }
    $problem = tokenProblem($_POST['token'] ?? null, $config);
    if ($problem !== null) {
        fail($problem[0], $problem[1], $problem[2] ? ['retry' => 'token'] : []);
    }
    $wait = rateLimit($config, false);
    if ($wait > 0) {
        fail(429, 'слишком много заявок подряд — следующую можно через ' . max(1, (int) ceil($wait / 60)) . ' мин', [], ['Retry-After: ' . $wait]);
    }

    $data = readFields();
    $photos = readPhotos();
    rateLimit($config, true);

    @set_time_limit(180);
    $delivered = [];
    foreach ($config['channels'] as $name => $channel) {
        try {
            $ok = $name === 'mail' ? sendMail($data, $photos, $channel)
                : ($name === 'telegram' ? sendTelegram($data, $photos, $channel)
                : ($name === 'yclients' ? sendYclients($data, $channel) : saveFiles($data, $photos, $channel)));
        } catch (Throwable $error) {
            note("$name: " . get_class($error) . ' at line ' . $error->getLine());
            $ok = false;
        }
        if ($ok) {
            $delivered[] = $name;
        }
    }
    if (!$delivered) {
        fail(500, 'не удалось передать заявку мастеру');
    }
    respond(200, ['ok' => true]);
} catch (Throwable $error) {
    note('unexpected ' . get_class($error) . ' at line ' . $error->getLine());
    fail(500, 'ошибка на сервере');
}
