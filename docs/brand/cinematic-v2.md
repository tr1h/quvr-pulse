# QUVR Pulse — cinematic v2: Look closer

Статус: сценарий и пакет для производства. Видео ещё не сгенерировано. Генерация визуальной раскадровки встроенным imagegen завершилась сетевой ошибкой; изображения раскадровки пока нет.
Основа: позиционирование QUVR Pulse из README и стиль существующего YouTube-канала.
Формат: 12 секунд, вертикальный 9:16, монтажная цель 1080 × 1920, 24 fps.
Основная версия на английском для текущего канала; русская локализация ниже.

## Идея

«Блеск — ещё не вся картина». Герой рассматривает красивую золотую монету. Поворот открывает её пустую изнанку: это тонкая штампованная оболочка. Герой переводит внимание на проверку токена. Физический реквизит — метафора поверхностного впечатления, а не конкретный токен или результат анализа.

## Монтаж по секундам

| Время | Кадр и действие | Текст в монтаже | Звук |
|---|---|---|---|
| 0.00–2.00 | Макро: золотой диск между пальцами, за ним заинтересованный глаз героя. Тёплый блик сразу проходит по рельефу. Медленный наезд. | Looks good. | Короткий металлический звон, тихая комната. |
| 2.00–4.25 | Крупный план героя со смартфоном. Уверенная полуулыбка, палец останавливается над экраном. Взгляд возвращается к монете. | Look closer. | Приглушённый низкий пульс; перед склейкой короткая пауза. |
| 4.25–6.75 | Макро: пальцы поворачивают диск. На обратной стороне — пустая вогнутая золотая оболочка с тонким ободком. Поворот занимает около секунды, затем удержание для считывания. | Без текста: дать сюрпризу сработать. | Сухой тонкий щелчок фольги вместо тяжёлого звона. |
| 6.75–9.00 | Герой чуть поднимает бровь, кладёт оболочку на стол и внимательно смотрит в телефон. Спокойное, осмысленное действие. | Check the token. | Пульс возвращается, мягкий тактильный звук касания. |
| 9.00–12.00 | Чистая фирменная карточка: существующий знак и QUVR Pulse, тёмный фон, янтарный акцент. | Check before you buy. / quvrpulse.com | Короткое спокойное разрешение; голос: “QUVR Pulse. Check before you buy.” |

На финальной карточке читаемая дополнительная строка: “Risk signals. Not a guarantee.”
Никаких графиков прибыли, процентов или результатов реальных токенов в этой версии.

## Визуальный стиль и постоянство

- Один вымышленный взрослый герой: около 30 лет, оливковая кожа, короткие тёмные кудри, лёгкая щетина, тёмно-серая футболка без рисунка.
- Ночной домашний интерьер, ореховый стол, лампа слева, прохладный свет окна справа. Свет мотивирован реальными источниками.
- Палитра существующего проекта: почти чёрный #0e0f0d, тёплый белый #ece6d6, янтарный #ffb000.
- Реальная текстура кожи, мягкие блики, небольшая глубина резкости. В кадре 1 глаз остаётся различимым; в кадре 3 вся изнанка читается.
- Монета — один и тот же реквизит с нейтральным солнечным рельефом, без логотипа валюты или токена. Это заранее изготовленная полая оболочка: она не превращается и не разрушается.
- Телефон показан под углом без читаемого экрана. Если позже нужен интерфейс, вставить актуальный захват QUVR Pulse при монтаже; не генерировать вымышленные оценки.

## Промпты отдельных планов

Генерировать планы отдельно с запасом для монтажа. Длительность генерации выбрать из поддерживаемых выбранным сервисом; финальные интервалы задаёт монтажная таблица, а не предположение о возможностях API.
Использовать одобренный портрет/первый кадр как референс персонажа в последующих планах, если сервис это поддерживает. Контактный лист служит режиссёрским ориентиром, а не входным кадром для всех сцен сразу.

### Общая часть — добавлять к каждому промпту

```text
Photorealistic premium cinematic commercial, vertical 9:16. A fictional adult man, around 30, olive skin, short dark curly hair, subtle stubble, brown eyes, charcoal crewneck with no branding. Quiet apartment at night, walnut desk, warm tungsten desk lamp camera-left, soft cool window fill camera-right. Near-black olive shadows, restrained amber highlights, natural skin pores, subtle film grain, soft highlight rolloff. Consistent face, wardrobe, location and lighting throughout. The prop is a small unbranded thin stamped gold shell with a sunburst front and hollow concave back; it never transforms. Natural anatomy and restrained performance. No captions, logos, readable phone UI, graphs, currency symbols, magical particles or exaggerated neon. All typography will be added in editing.
```

### План 01 — первый кадр

```text
Extreme close-up of the gold sunburst disc held vertically between thumb and index finger, front face toward camera. His fascinated eye is visible immediately behind it. Start on the striking composition with no fade-in. A warm specular glint rolls over the embossed front as the fingers tilt it only slightly; do not reveal the back yet. Very slow camera push, shallow depth of field, deliberate premium product cinematography. Single continuous shot. No tossing or floating object.
```

### План 02 — пауза перед действием

```text
Intimate close-up, three-quarter angle. The same man holds his smartphone low over the desk; its display is angled away and unreadable. A restrained confident half-smile, one index finger hovers above the phone and stops. He glances toward the gold disc held in his other hand. Curiosity, subtle eyebrow movement, no alarm. Mostly locked camera with a tiny natural drift. One simple action, single continuous shot.
```

### План 03 — сюрприз

```text
Macro insert at the same desk. The same thumb and index finger hold the gold sunburst disc front toward camera, then rotate it approximately 150 degrees once to reveal its hollow concave back and thin crimped rim. It is clearly an inexpensive stamped gold-foil shell, not a solid coin. The shell was hollow all along: no morphing, no melting, no explosion. Make the turn physically plausible and the hollow backside unmistakable. Hold the revealed back steady for a full second. Side lighting makes the thin rim and concavity legible. Single continuous shot, locked camera.
```

### План 04 — проверка

```text
Medium close-up of the same man at the same desk. With a small thoughtful raised eyebrow he sets the hollow shell down on the walnut surface, then looks attentively at his phone. Display remains unreadable. Quiet, composed expression, no triumphant smile and no promise of a successful trade. Gentle push toward his face. Keep the action simple and physically continuous.
```

## Финальная карточка и звук

Собрать карточку в монтажной программе, используя существующий знак из apps/web/src/components/PulseMark.tsx или готовый docs/brand/quvr-avatar.png. Не поручать видеомодели рисовать название и URL.

На 1080 × 1920 держать ключевой текст внутри центральной области x=110…970, y=280…1500. Название около 90 px, слоган 64 px, URL 50 px, дополнительная строка не меньше 32 px. Оставить карточку целиком на последние 3 секунды, без мелких бегущих титров. Перед экспортом проверить читаемость на телефоне.

Голос спокойный, разговорный, без трейлерного пафоса. Музыка — редкий низкий пульс и короткое разрешение, без заимствованной коммерческой композиции. Звук подчёркивает разницу между ожидаемой тяжёлой монетой и тонкой оболочкой.

Русская локализация титров: «Выглядит красиво.» → «Посмотри ближе.» → «Проверь токен.» → «Проверь, прежде чем покупать.» Голос: «QUVR Pulse. Проверь, прежде чем покупать». Дополнительная строка: «Признаки риска. Без гарантий».

## Файлы и готовность

- cinematic-v2.md — сценарий, монтаж и промпты видео.
- cinematic-v2-endcard.svg — готовый векторный макет финальной карточки 1080 × 1920 с существующим знаком бренда.
- cinematic-v2-endcard.png — растровый экспорт карточки для монтажа; визуально проверен.
- cinematic-v2.en.srt — английские титры с монтажными таймкодами; при использовании готовой карточки не дублировать поверх неё последний титр.
- cinematic-v2-storyboard-prompt.txt — полный промпт визуальной раскадровки для встроенного imagegen.
- cinematic-v2-storyboard.png — визуальная раскадровка, если генерация изображения завершилась успешно.

Для готового MP4 остаются генерация четырёх видеопланов в подключённом видеосервисе, монтаж, голос и экспорт. Этот пакет не является готовым видеороликом.
