# -*- coding: utf-8 -*-
"""Extract units, vocabulary, texts and tasks from the source materials."""
import json
import re
from pathlib import Path

SRC = Path(r"C:\Users\HYPERPC\AppData\Local\Temp\docx_extract\book.txt")
OUT = Path(__file__).resolve().parent.parent / "data" / "units.json"

UNIT_TITLES = {
    1: ("The History of Computers", "История компьютеров"),
    2: ("Types of Computers", "Типы компьютеров"),
    3: ("Computer Hardware", "Компьютерное железо"),
    4: ("Primary Storage", "Первичная память"),
    5: ("Secondary Storage", "Вторичная память"),
    6: ("Software", "Программное обеспечение"),
    7: ("Networks", "Компьютерные сети"),
    8: ("The Internet", "Интернет"),
    9: ("Search Engines", "Поисковые системы"),
    10: ("Programming Languages", "Языки программирования"),
    11: ("Web Design", "Веб-дизайн"),
    12: ("Malware and Cybercrime", "Вредоносное ПО и киберпреступность"),
    13: ("Data Security", "Безопасность данных"),
    14: ("Future in IT", "Будущее ИТ"),
    15: ("Professions in IT", "Профессии в ИТ"),
}

VOCAB_FIX = {
    (1, "invention"): ("invention", "изобретение, создание"),
    (1, "resistor"): ("resistor", "резистор; сопротивление (элемент схемы)"),
    (1, "major breakthrough"): ("major breakthrough", "основной прорыв"),
    (1, "ALU (arithmetic logic unit)"): ("ALU (arithmetic logic unit)", "арифметико-логическое устройство"),
    (2, "foldable keyboard"): ("foldable keyboard", "складная клавиатура"),
    (2, "virtual keyboard"): ("virtual keyboard", "виртуальная клавиатура"),
    (2, "desktop PC"): ("desktop PC", "стационарный компьютер"),
    (2, "battery pack"): ("battery pack", "аккумуляторная батарея"),
    (2, "wearable computer"): ("wearable computer", "носимый компьютер"),
    (2, "detached/physical keyboard"): ("detached / physical keyboard", "традиционная (физическая) клавиатура"),
    (2, "touchpad"): ("touchpad", "сенсорная панель (тачпад)"),
    (3, "hardware"): ("hardware", "аппаратное обеспечение"),
    (3, "front side bus"): ("front side bus", "системная шина (фронтальная)"),
    (3, "software"): ("software", "программное обеспечение"),
    (3, "RAM random access memory"): ("RAM (random access memory)", "оперативное запоминающее устройство (ОЗУ); оперативная память"),
    (3, "ROM read-only memory"): ("ROM (read-only memory)", "постоянное запоминающее устройство (ПЗУ)"),
    (3, "HDD hard disk drive"): ("HDD (hard disk drive)", "жёсткий диск"),
    (3, "central processing unit"): ("central processing unit (CPU)", "центральный процессор"),
    (4, "primary storage"): ("primary storage", "основное запоминающее устройство"),
    (4, "consistent data"): ("consistent data", "согласованные данные"),
    (4, "delay/ latency"): ("delay / latency", "задержка (сигнала)"),
    (4, "erasable"): ("erasable", "перезаписываемый, допускающий стирание"),
    (4, "cache memory"): ("cache memory", "кэш, быстродействующая буферная память"),
    (4, "write -back cache"): ("write-back cache", "кэш с обратной записью; кэш с последующей выгрузкой изменённых блоков в основную память"),
    (4, "write-through cache"): ("write-through cache", "кэш со сквозной записью; кэш с одновременной записью в основную память"),
    (5, "memory capacity"): ("memory capacity", "объём памяти"),
    (5, "flash controller"): ("flash controller", "контроллер флэш-памяти"),
    (5, "integratedcircuit"): ("integrated circuit", "интегральная схема"),
    (5, "CD (Compact Disc)"): ("CD (Compact Disc)", "CD-диск"),
    (5, "DVD (Digital Video Disc)"): ("DVD (Digital Video Disc)", "DVD-диск"),
    (5, "Blue-ray disc"): ("Blu-ray disc", "диск Blu-ray"),
    (5, "solid state drive (SSD)"): ("solid-state drive (SSD)", "твердотельный накопитель"),
    (6, "open-source software"): ("open-source software", "ПО с открытым исходным кодом"),
    (6, "device driver"): ("device driver", "драйвер устройства"),
    (6, "Windows, Icons, Menus, Pointer (WIMP)"): ("WIMP (Windows, Icons, Menus, Pointer)", "окна, иконки, меню, указатель"),
    (6, "proprietary software"): ("proprietary software", "закрытое (проприетарное) программное обеспечение"),
    (6, "real-time operating system"): ("real-time operating system", "операционная система реального времени"),
    (7, "hub"): ("hub", "концентратор или повторитель"),
    (7, "mesh topology"): ("mesh topology", "топология сетки, ячеистая топология"),
    (7, "application layer"): ("application layer", "прикладной уровень"),
    (7, "twisted -pair cable"): ("twisted-pair cable", "витая пара"),
    (7, "fiber optic cable"): ("fiber-optic cable", "оптоволоконный кабель"),
    (7, "tree topology"): ("tree topology", "древовидная топология, топология типа «дерево»"),
    (8, "satellite connection"): ("satellite connection", "спутниковая связь"),
    (8, "ISP"): ("ISP (Internet Service Provider)", "провайдер интернет-услуг"),
    (8, "FTP – file transport protocol"): ("FTP (File Transfer Protocol)", "протокол передачи файлов"),
    (8, "Dial - up connection"): ("dial-up connection", "коммутируемое соединение"),
    (8, "Digital Subscriber Line DSL"): ("DSL (Digital Subscriber Line)", "цифровая абонентская линия"),
    (8, "ADSL – Asymmetric DigitalSubscriber Line"): ("ADSL (Asymmetric Digital Subscriber Line)", "асимметричная цифровая абонентская линия"),
    (8, "SDSL – symmetric Digital SubscriberLine"): ("SDSL (Symmetric Digital Subscriber Line)", "симметричная цифровая абонентская линия"),
    (8, "WWW – World - Wide Web"): ("WWW (World Wide Web)", "всемирная паутина"),
    (8, "HTTP- Hyper Text Transfer Protocol"): ("HTTP (HyperText Transfer Protocol)", "протокол передачи гипертекста"),
    (9, "human-powered directorie"): ("human-powered directory", "каталог, управляемый человеком"),
    (9, "crawling"): ("crawling", "сканирование, обход"),
    (10, "programming language"): ("programming language", "язык программирования"),
    (10, "object-oriented programming (OOP)"): ("object-oriented programming (OOP)", "объектно-ориентированное программирование"),
    (10, "symbolic language"): ("symbolic language", "система символов; язык символов (язык символического кодирования)"),
    (10, "java applets"): ("Java applets", "мини-приложения на языке Java"),
    (11, "webpage"): ("web page", "веб-страница"),
    (11, "to upload"): ("to upload", "загружать на сервер"),
    (11, "app"): ("app", "прикладная программа, приложение"),
    (11, "frame"): ("frame", "независимо заполняемая область HTML-документа с возможностью прокрутки содержания"),
    (12, "Payload"): ("payload", "полезная нагрузка (боевая нагрузка) вируса"),
    (12, "shareware"): ("shareware", "условно бесплатное ПО (испытательный срок)"),
    (12, "host file"): ("host file", "файл узла (содержит IP-адреса узлов и список соответствующих имён DNS)"),
    (12, "phishing"): ("phishing", "фишинг, интернет-мошенничество с целью хищения личных данных и паролей"),
    (12, "DDoS attack Distributed Denial of Service"): ("DDoS attack (Distributed Denial of Service)", "распределённая атака типа «отказ в обслуживании»"),
    (13, "firewall"): ("firewall", "брандмауэр; корпоративный межсетевой экран"),
    (13, "uniterruptible power supplies"): ("uninterruptible power supply (UPS)", "источник бесперебойного питания"),
    (13, "to prevent an unauthorized access"): ("to prevent unauthorized access", "предотвратить несанкционированный (неавторизованный) доступ"),
    (13, "phishing"): ("phishing", "фишинг, интернет-мошенничество с целью хищения личных данных и паролей"),
    (13, "piggybacking"): ("piggybacking", "несанкционированное проникновение вслед за зарегистрированным пользователем"),
    (13, "differential backup"): ("differential backup", "разностное резервное копирование (копирует файлы, изменённые с момента последнего полного бэкапа)"),
    (14, "IoT"): ("IoT (Internet of Things)", "интернет вещей"),
    (14, "artificial Intelligence"): ("artificial intelligence", "искусственный интеллект"),
    (14, "augmented reality"): ("augmented reality", "дополненная реальность"),
    (14, "machine learning"): ("machine learning", "машинное обучение"),
    (14, "fully connected neural network"): ("fully connected neural network", "полносвязная нейронная сеть"),
    (14, "backpropagation"): ("backpropagation", "обратное распространение ошибки"),
    (14, "Internet of Things"): ("IoT (Internet of Things)", "интернет вещей"),
    (15, "backend developer – backend"): ("backend developer", "backend-разработчик"),
    (15, "full-stack developer - full-stack"): ("full-stack developer", "full-stack-разработчик"),
}

VOCAB_ADD = {
    2: [
        ("USB (Universal Serial Bus) port", "USB-порт"),
    ],
    8: [
        ("VDSL (Very high bit rate DSL)", "скоростная цифровая абонентская линия"),
        ("ISP (Internet Service Provider)", "провайдер интернет-услуг"),
        ("FTP (File Transfer Protocol)", "протокол передачи файлов"),
        ("HTTP (HyperText Transfer Protocol)", "протокол передачи гипертекста"),
        ("WWW (World Wide Web)", "всемирная паутина"),
    ],
    15: [
        ("frontend developer", "frontend-разработчик"),
    ],
    7: [
        ("session layer", "сеансовый уровень"),
    ],
}

TASK_RE = re.compile(r"^Task\s+(\d+)\s*[.:]\s*(.*)$", re.I)
TEXT_RE = re.compile(r"^(?:Text|TEXT)\s+([AB])\.?\s*(.*)$")
UNIT_RE = re.compile(r"^UNIT\s+(\d+)\.\s*(.+)$")

CYR = "А-Яа-яЁё"
SEP_RE = re.compile(r"\s*[-–—]\s*")


def clean(s: str) -> str:
    s = s.replace("\u00ad", "").replace("\xa0", " ")
    s = re.sub(r"\s+", " ", s)
    s = s.strip(" |")
    # common PDF font artefacts
    s = re.sub(r"^с(?=[a-z])", "c", s)  # Cyrillic с at word start
    s = s.replace("электронныелампы", "электронные лампы")
    s = s.replace("искусственныйинтеллект", "искусственный интеллект")
    s = s.replace("интегральныесхемы", "интегральные схемы")
    s = s.replace("параллельнаяобработка данных", "параллельная обработка данных")
    s = s.replace("вычислительнаяпроизводительность", "вычислительная производительность")
    s = s.replace("системаввода/вывода", "система ввода/вывода")
    s = s.replace("сопровождение, обслуживание, проведениетехобслуживания", "сопровождение, обслуживание, проведение техобслуживания")
    s = s.replace("сверхбольшаяинтегральная схема", "сверхбольшая интегральная схема")
    s = s.replace("вычислительная системапятого поколения", "вычислительная система пятого поколения")
    s = s.replace("электронныелампы", "электронные лампы")
    s = s.replace("полупроводниковаятехнология", "полупроводниковая технология")
    s = s.replace("твердотельный накопитель", "твердотельный накопитель")
    s = s.replace("жесткийдиск", "жёсткий диск")
    s = s.replace("устройствахранения", "устройства хранения")
    s = s.replace("базоваясистема ввода/вывода", "базовая система ввода/вывода")
    s = s.replace("системный тактовыйгенератор", "системный тактовый генератор")
    s = s.replace("внутренняяпамять", "внутренняя память")
    s = s.replace("периферийноеоборудование", "периферийное оборудование")
    s = s.replace("центральный процессор", "центральный процессор")
    s = s.replace("оперативное запоминающееустройство", "оперативное запоминающее устройство")
    s = s.replace("постоянное запоминающее устройство", "постоянное запоминающее устройство")
    s = s.replace("текстовыйредактор", "текстовый редактор")
    s = s.replace("закрытоепрограммное обеспечение", "закрытое программное обеспечение")
    s = s.replace("графический пользовательскийинтерфейс", "графический пользовательский интерфейс")
    s = s.replace("многопользовательская операционная система", "многопользовательская операционная система")
    s = s.replace("однопользовательская операционная система", "однопользовательская операционная система")
    s = s.replace("операционные системы реального времени", "операционные системы реального времени")
    s = s.replace("кольцеваятопология", "кольцевая топология")
    s = s.replace("пропускнаяспособность", "пропускная способность")
    s = s.replace("общаяшина", "общая шина")
    s = s.replace("магистральный кабель,магистраль", "магистральный кабель, магистраль")
    s = s.replace("модельвзаимодействия открытых систем", "модель взаимодействия открытых систем")
    s = s.replace("оптоволоконныйкабель", "оптоволоконный кабель")
    s = s.replace("витая пара (кабель для интернета, напрямую соединенный со стационарнымустройством)", "витая пара (кабель для интернета, напрямую соединённый со стационарным устройством)")
    s = s.replace("сеансовый уровень", "сеансовый уровень")
    s = s.replace("уровень представления , представительный уровень", "уровень представления, представительный уровень")
    s = s.replace("связанные данные", "связанные данные")
    s = s.replace("задержка сигнала", "задержка сигнала")
    s = s.replace("передаватьданные", "передавать данные")
    s = s.replace("скорость выгрузки", "скорость выгрузки")
    s = s.replace("скорость загрузки", "скорость загрузки")
    s = s.replace("цифровой сигнал", "цифровой сигнал")
    s = s.replace("отказать в доступе", "отказать в доступе")
    s = s.replace("широкополосный", "широкополосный")
    s = s.replace("сотоваясвязь", "сотовая связь")
    s = s.replace("меднаявитая пара", "медная витая пара")
    s = s.replace("оптоволоконныйкабель", "оптоволоконный кабель")
    s = s.replace("протокол передачи данных", "протокол передачи данных")
    s = s.replace("коммутируемое соединение", "коммутируемое соединение")
    s = s.replace("цифровая абонентская линия", "цифровая абонентская линия")
    s = s.replace("сетеваямагистраль", "сетевая магистраль")
    s = s.replace("Ассиметричная цифровая абонентская линия", "асимметричная цифровая абонентская линия")
    s = s.replace("Симметричная цифровая абонентская линия", "симметричная цифровая абонентская линия")
    s = s.replace("всемирная компьютерная сеть; всемирная паутина; веб", "всемирная компьютерная сеть; всемирная паутина; веб")
    s = s.replace("протокол гипертекстовойпередачи", "протокол гипертекстовой передачи")
    s = s.replace("скоростная цифровая абонентская линия", "скоростная цифровая абонентская линия")
    s = s.replace("поисковая система на основепоискового бота", "поисковая система на основе поискового бота")
    s = s.replace("социально-ориентированныйпоисковик", "социально-ориентированный поисковик")
    s = s.replace("поисковыйзапрос", "поисковый запрос")
    s = s.replace("адрес ресурса в сети Интернет", "адрес ресурса в сети Интернет")
    s = s.replace("система доменных имен", "система доменных имён")
    s = s.replace("каталоги, управляемыечеловеком", "каталоги, управляемые человеком")
    s = s.replace("миниприложения наязыке Java", "мини-приложения на языке Java")
    s = s.replace("высокоуровневая абстракция", "высокоуровневая абстракция")
    s = s.replace("низкоуровневый язык", "низкоуровневый язык")
    s = s.replace("высокоуровневый язык", "высокоуровневый язык")
    s = s.replace("системасимволов; язык символов(язык символическогокодирования)", "система символов; язык символов (язык символического кодирования)")
    s = s.replace("объектно-ориентированноепрограммирование программныхсистем", "объектно-ориентированное программирование программных систем")
    s = s.replace("разработкасерверной части", "разработка серверной части")
    s = s.replace("разработкаинтерфейса", "разработка интерфейса")
    s = s.replace("конструктор веб-сайтов (веб-редактор)", "конструктор веб-сайтов (веб-редактор)")
    s = s.replace("независимо заполняемая область HTML-документа с возможностью прокруткисодержания", "независимо заполняемая область HTML-документа с возможностью прокрутки содержания")
    s = s.replace("Троянский конь", "троянский конь")
    s = s.replace("бесплатные ПО", "бесплатное ПО")
    s = s.replace("шпионские программы", "шпионские программы")
    s = s.replace("запуск, активация вируса", "запуск, активация вируса")
    s = s.replace("рекламное ПО", "рекламное ПО")
    s = s.replace("кибермошенничество", "киберпреступность")
    s = s.replace("вредоносное ПО", "вредоносное ПО")
    s = s.replace("программы-вымогатели", "программы-вымогатели")
    s = s.replace("процедурадезориентации", "процедура дезориентации")
    s = s.replace("процедуравоспроизводства", "процедура воспроизводства")
    s = s.replace("полезная нагрузка (боеваянагрузка) вируса", "полезная нагрузка (боевая нагрузка) вируса")
    s = s.replace("лазейка; потайнойход; путь обхода системы защиты", "лазейка; потайной ход; путь обхода системы защиты")
    s = s.replace("условно бесплатное ПО (испытательный срок)", "условно бесплатное ПО (испытательный срок)")
    s = s.replace("брандмауер;корпоративный межсетевой экран", "брандмауэр; корпоративный межсетевой экран")
    s = s.replace("бритьёсалями", "бритьё салями")
    s = s.replace("злоумышленник ,взломщик программ", "злоумышленник, взломщик программ")
    s = s.replace("мерыбезопасности", "меры безопасности")
    s = s.replace("спуфингподмена IP адресов", "спуфинг — подмена IP-адресов")
    s = s.replace("неавторизованный доступ,несанкционированный доступ", "неавторизованный доступ, несанкционированный доступ")
    s = s.replace("вирус, замещающий программный код,перезаписывающий вирус", "вирус, замещающий программный код, перезаписывающий вирус")
    s = s.replace("запускать заражённую программу", "запускать заражённую программу")
    s = s.replace("клавиатурный шпионклавиатурный перехватчик", "клавиатурный шпион, клавиатурный перехватчик")
    s = s.replace("файл узла (содержит IP- адреса узлов и списоксоответствующих имен DNS)", "файл узла (содержит IP-адреса узлов и список соответствующих имён DNS)")
    s = s.replace("фишинг, интернет-мошенничество с целью хищения личных данных, выуживание паролей", "фишинг, интернет-мошенничество с целью хищения личных данных, выуживание паролей")
    s = s.replace("несанкционированное проникновение вслед за зарегистрированным пользователем(напр., проникновение в сеть )", "несанкционированное проникновение вслед за зарегистрированным пользователем (напр., проникновение в сеть)")
    s = s.replace("распределённая атака на отказ в обслуживании", "распределённая атака на отказ в обслуживании")
    s = s.replace("архивировать", "архивировать")
    s = s.replace("сигнатура", "сигнатура")
    s = s.replace("сетевой фильтрbackup- резервное копирование", "сетевой фильтр")
    s = s.replace("ПО отнадежного поставщика", "ПО от надёжного поставщика")
    s = s.replace("безопасность всети", "безопасность в сети")
    s = s.replace("биометрические средства защиты", "биометрические средства защиты")
    s = s.replace("обновлять антивирусное ПО", "обновлять антивирусное ПО")
    s = s.replace("программноеобеспечение без вирусов", "программное обеспечение без вирусов")
    s = s.replace("открытый текст(незашифрованный)", "открытый текст (незашифрованный)")
    s = s.replace("бесперебойник, источникбесперебойного питания", "бесперебойник, источник бесперебойного питания")
    s = s.replace("верификация подписи, проверка подлинностиподписи", "верификация подписи, проверка подлинности подписи")
    s = s.replace("добавочное резевное копирование (копируются только файлы, созданные или измененные с момента последнегорезервного копирования )", "добавочное резервное копирование (копируются только файлы, созданные или изменённые с момента последнего резервного копирования)")
    s = s.replace("разностное или частичное резервное копирование, (выполняет копирование файлов,созданных или измененных с момента обычного (или добавочного) архивирования)", "разностное или частичное резервное копирование (копирует файлы, созданные или изменённые с момента обычного или добавочного архивирования)")
    s = s.replace("бит архива/архивный бит (используется программамирезервирования для отметки файлов при выполнении нормального или добавочного резервирования )", "бит архива / архивный бит (используется программами резервирования для отметки файлов при выполнении нормального или добавочного резервирования)")
    s = s.replace("совместимость", "совместимость")
    s = s.replace("кластеризация", "кластеризация")
    s = s.replace("распознаваниелиц", "распознавание лиц")
    s = s.replace("на основе технологииинтернета вещей", "на основе технологии интернета вещей")
    s = s.replace("искусственный интеллект", "искусственный интеллект")
    s = s.replace("входные (вводные)данные", "входные (вводные) данные")
    s = s.replace("взаимосвязанные узлы", "взаимосвязанные узлы")
    s = s.replace("решатьмножество задач", "решать множество задач")
    s = s.replace("уникальный идентификатор", "уникальный идентификатор")
    s = s.replace("автоматизированныйдом", "автоматизированный дом")
    s = s.replace("полносвязные нейросети", "полносвязные нейросети")
    s = s.replace("свёрточная нейронная сеть", "свёрточная нейронная сеть")
    s = s.replace("технологияинтернета вещей", "технология интернета вещей")
    s = s.replace("с выходом винтернет", "с выходом в интернет")
    s = s.replace("нейронная сеть с алгоритмом обратногораспространения ошибки,обратное распространение", "нейронная сеть с алгоритмом обратного распространения ошибки, обратное распространение")
    s = s.replace("рекуррентная нейроннаясеть( нейронная сеть с обратной связью)", "рекуррентная нейронная сеть (нейронная сеть с обратной связью)")
    s = s.replace("конфиденциальные данные (совершенно секретные данные или представляющиекоммерческую тайну)", "конфиденциальные данные (совершенно секретные данные или представляющие коммерческую тайну)")
    s = s.replace("искусственная нейронная сеть (нейросеть), ИНС", "искусственная нейронная сеть (нейросеть), ИНС")
    s = s.replace("изображения, формируемые методами компьютерной графики; изображения, формируемые с помощьюкомпьютера; интерфейс компьютерной графики", "изображения, формируемые методами компьютерной графики; изображения, формируемые с помощью компьютера; интерфейс компьютерной графики")
    s = s.replace("аналитик данных", "аналитик данных")
    s = s.replace("backendразработчик", "backend-разработчик")
    s = s.replace("frontend разработчик", "frontend-разработчик")
    s = s.replace("администратор базы данных", "администратор базы данных")
    s = s.replace("инженерпрограммного обеспечения", "инженер программного обеспечения")
    s = s.replace("full-stackразработчик", "full-stack-разработчик")
    s = s.replace("сетевойинженер", "сетевой инженер")
    s = s.replace("системныйадминистратор", "системный администратор")
    s = s.replace("инженер поаппаратному обеспечению", "инженер по аппаратному обеспечению")
    s = s.replace("архитектороблачных технологий", "архитектор облачных технологий")
    s = s.replace("специалист повопросам безопасности", "специалист по вопросам безопасности")
    return s


def split_pair(segment: str):
    """Split an 'english - russian' vocabulary segment."""
    segment = clean(segment)
    if not segment:
        return None
    # Find a dash followed by a Cyrillic letter (or quote) - this is the translation separator.
    best = None
    for m in SEP_RE.finditer(segment):
        rest = segment[m.end():].lstrip()
        if rest and re.match(f"[{CYR}«\"“]", rest[0]):
            best = m
            break
    if best is None:
        # fall back to the last ' - '
        idx = segment.rfind(" - ")
        if idx == -1:
            return (segment, "")
        return (segment[:idx].strip(), segment[idx + 3:].strip())
    en = segment[:best.start()].strip(" .;")
    ru = segment[best.end():].strip(" .;")
    return (en, ru)


LOOKALIKE = {
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x",
    "к": "k", "м": "m", "т": "t", "в": "v", "н": "n",
}


def fix_latin_lookalikes(text: str) -> str:
    """In mostly-English paragraphs, replace Cyrillic lookalike letters."""
    letters = re.findall(r"[A-Za-zА-Яа-яЁё]", text)
    if not letters:
        return text
    latin = len(re.findall(r"[A-Za-z]", text))
    if latin / len(letters) < 0.8:
        return text
    trans = str.maketrans(LOOKALIKE)
    return text.translate(trans)


def merge_paragraphs(paras):
    out = []
    for p in paras:
        p = fix_latin_lookalikes(p)
        p = re.sub(r"([A-Za-z])-\s+([a-z])", r"\1-\2", p)
        p = re.sub(r"([A-Za-z])\(([A-Za-z])", r"\1 (\2", p)
        if re.fullmatch(r"\d+", p):
            continue
        if out and should_join(out[-1], p):
            if out[-1].endswith("-") and p[:1].islower():
                out[-1] = out[-1] + p
            else:
                out[-1] = out[-1].rstrip() + " " + p.lstrip()
        else:
            out.append(p)
    return out


def should_join(prev: str, nxt: str) -> bool:
    if not prev or not nxt:
        return False
    if prev[-1] in ",;":
        return True
    if prev.endswith(":") and nxt[:1].islower():
        return True
    if prev[-1] not in ".!?…":
        if nxt[:1].islower() or len(prev) > 80:
            return True
    return False


def parse_vocab(lines):
    items = []
    for line in lines:
        if not line.strip():
            continue
        for seg in line.split("|"):
            parsed = split_pair(seg)
            if not parsed:
                continue
            if len(parsed) == 3:
                en, ru, extra = parsed
                if en and ru:
                    items.append({"en": en, "ru": ru})
                if extra and extra[0] and extra[1]:
                    items.append({"en": extra[0], "ru": extra[1]})
            else:
                en, ru = parsed
                if en and ru:
                    items.append({"en": en, "ru": ru})
    # dedupe by lowercased English, keep the longest Russian translation
    seen = {}
    for it in items:
        key = it["en"].lower().strip()
        if key not in seen or len(it["ru"]) > len(seen[key]["ru"]):
            seen[key] = it
    return list(seen.values())


def parse_unit(num, lines):
    title_en, title_ru = UNIT_TITLES.get(num, (f"Unit {num}", f"Юнит {num}"))
    vocab, texts, tasks = [], [], []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i].strip()
        low = line.lower()
        if low == "active vocabulary":
            j = i + 1
            vocab_lines = []
            while j < n and not re.match(r"^Task\s+1\b", lines[j].strip(), re.I):
                vocab_lines.append(lines[j])
                j += 1
            vocab = parse_vocab(vocab_lines)
            i = j
            continue
        m = TEXT_RE.match(line)
        if m:
            letter = m.group(1).upper()
            text_title = m.group(2).strip() or f"Text {letter}"
            j = i + 1
            paras = []
            while j < n:
                s = lines[j].strip()
                if TASK_RE.match(s) or UNIT_RE.match(s) or s == "GLOSSARY":
                    break
                if TEXT_RE.match(s):
                    break
                if s:
                    paras.append(clean(s))
                j += 1
            texts.append({"letter": letter, "title": text_title, "paragraphs": merge_paragraphs(paras)})
            i = j
            continue
        m = TASK_RE.match(line)
        if m:
            task_num = int(m.group(1))
            task_title = clean(m.group(2))
            j = i + 1
            body = []
            while j < n:
                s = lines[j].strip()
                if TASK_RE.match(s) or TEXT_RE.match(s) or UNIT_RE.match(s) or s == "GLOSSARY":
                    break
                if s:
                    body.append(clean(s))
                j += 1
            tasks.append({"num": task_num, "title": task_title, "body": body})
            i = j
            continue
        i += 1
    fixed = []
    for it in vocab:
        key = (num, it["en"])
        if key in VOCAB_FIX:
            en, ru = VOCAB_FIX[key]
            fixed.append({"en": en, "ru": ru})
        else:
            fixed.append(it)
    for en, ru in VOCAB_ADD.get(num, []):
        if not any(x["en"].lower() == en.lower() for x in fixed):
            fixed.append({"en": en, "ru": ru})
    # final dedupe after fixes
    dedup, seen = [], set()
    for it in fixed:
        k = it["en"].lower().strip()
        if k not in seen:
            seen.add(k)
            dedup.append(it)
    if num == 15:
        for t in texts:
            t["title"] = "Professions in IT"
    return {
        "id": num,
        "title_en": title_en,
        "title_ru": title_ru,
        "vocab": dedup,
        "texts": texts,
        "tasks": tasks,
    }


def main():
    raw = SRC.read_text(encoding="utf-8")
    lines = raw.splitlines()
    units = []
    cur_num = None
    cur_lines = []
    for line in lines:
        m = UNIT_RE.match(line.strip())
        if m:
            if cur_num is not None:
                units.append(parse_unit(cur_num, cur_lines))
            cur_num = int(m.group(1))
            cur_lines = []
        elif line.strip() == "GLOSSARY" and cur_num is not None:
            units.append(parse_unit(cur_num, cur_lines))
            cur_num = None
            cur_lines = []
        elif cur_num is not None:
            cur_lines.append(line)
    if cur_num is not None:
        units.append(parse_unit(cur_num, cur_lines))
    # remove units without content
    units = [u for u in units if u["vocab"] or u["texts"]]
    for u in units:
        u["translation_sentences"] = collect_translations(u)
    OUT.write_text(json.dumps({"units": units}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"units: {len(units)}")
    for u in units:
        print(f'{u["id"]:2d} vocab={len(u["vocab"]):3d} texts={len(u["texts"])} tasks={len(u["tasks"])} sentences={len(u["translation_sentences"])}')


def collect_translations(unit):
    out = []
    for t in unit["tasks"]:
        is_translation = bool(re.search(r"translat|перевед|translate", t["title"], re.I))
        for line in t["body"]:
            if "|" in line:
                continue
            cyr = len(re.findall(f"[{CYR}]", line))
            lat = len(re.findall(r"[A-Za-z]", line))
            words = len(re.findall(r"[А-Яа-яЁёA-Za-z-]+", line))
            long_russian = cyr >= 30 and cyr > lat * 2 and words >= 5 and len(line) > 40
            if (is_translation and cyr >= 8 and cyr > lat * 1.5 and len(line) > 15) or long_russian:
                line = clean(line)
                if line not in out:
                    out.append(line)
    # unique, keep order
    seen, res = set(), []
    for s in out:
        k = s.lower()
        if k not in seen:
            seen.add(k)
            res.append(s)
    return res


if __name__ == "__main__":
    main()
