# Lovense CDN/API DPI Checker

Публичная веб-страница для проверки доступности доменов **Lovense Cam Extension** и **Lovense OBS Toolset** с вашей сети (в т.ч. блокировки DPI методом TCP 16-20).

**Открыть checker:** [bymakk.github.io/hyperion-lovence-checker/ru/lovense/](https://bymakk.github.io/hyperion-lovence-checker/ru/lovense/)

## Как пользоваться

1. Отключите VPN (если возможно).
2. Откройте страницу checker в браузере.
3. Нажмите **Start**.
4. Смотрите колонки **Alive** (доступен ли хост) и **TCP 16-20** (признаки DPI-блокировки).

Рекомендации как в [hyperion-cs/dpi-checkers](https://github.com/hyperion-cs/dpi-checkers): режим инкогнито, между прогонами сбрасывайте сокеты в `chrome://net-internals/#sockets`.

### GET-параметры

| Параметр | Описание |
|----------|----------|
| `timeout` | Таймаут в мс (по умолчанию 15000) |
| `host` | Дополнительный хост для проверки |
| `provider` | Имя провайдера для custom-хоста |

Пример: `?timeout=10000&host=example.com&provider=Custom`

## Список доменов (из анализа v31.6.5 / OBS 2.4.8)

Домены извлечены из `Lovense Cam Extension` и `Lovense OBS Toolset` (JS, DLL, manifest).

### API (`*.lovense-api.com`)

| ID | Домен | Назначение |
|----|-------|------------|
| LV.API-01 | `apps.lovense-api.com` | Webcam proxy, GFW, UploadFiles |
| LV.API-02 | `date.lovense-api.com` | Переводы UI |
| LV.API-03 | `cdn.lovense-api.com` | CDN ассетов extension |
| LV.API-04 | `coll.lovense-api.com` | Coll/analytics API |
| LV.API-05 | `log.lovense-api.com` | Логирование extension |

### Apps / Web (`*.lovense.com`)

| ID | Домен | Назначение |
|----|-------|------------|
| LV.APP-01 | `apps.lovense.com` | Статика, обновления, myip |
| LV.APP-02 | `apps2t.lovense.com` | Staging/test apps |
| LV.WEB-01 | `www.lovense.com` | Cam model UI |
| LV.EXT-01 | `extension.lovense.com` | Ресурсы extension |
| LV.SVC-01 | `service.lovense.com` | Service backend |
| LV.LOG-01 | `coll.lovense.com` | Логи OBS Toolset |

### Relay (`*.lovense.club`)

| ID | Домен | Назначение |
|----|-------|------------|
| LV.CLUB-01 | `lovense.club` | Relay-домен, SSL |
| LV.CLUB-02 | `127-0-0-1.lovense.club` | Local WSS bridge |

### Ключевые API-пути

- `https://apps.lovense-api.com/api/webcam`
- `https://apps.lovense-api.com/gfw/common/`
- `https://apps.lovense.com/api/biz/myip`
- `https://coll.lovense.com/coll-log/genLogToken`
- `https://date.lovense-api.com/date-web-api/appTranslationV2/cam/getLang`

### Не включено

- `gitlab.lovense.cn` — внутренний dev-хост

## Ограничения

- Проверка выполняется **в браузере пользователя** — результат отражает его сеть/ISP.
- `mode: no-cors` не показывает HTTP-код, только факт соединения/таймаут.
- `127-0-0-1.lovense.club` — локальный relay; может вести себя иначе, чем публичные CDN.

## Лицензия

Checker основан на [hyperion-cs/dpi-checkers](https://github.com/hyperion-cs/dpi-checkers) (Apache-2.0). Suite адаптирован под домены Lovense.

## GitHub Pages

Settings → Pages → Deploy from branch **main** / **(root)**.
