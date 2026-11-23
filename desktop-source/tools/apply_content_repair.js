const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "units.json");
const parsedPath = path.join(process.env.TEMP, "itelab-parsed-tasks.json");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf8"));

const overrides = {
  1: {
    4: [
      "arithmetical operations / resembling / mathematician / a rapid evolution / programmable / invention / computer / vacuum tubes / instructions / predecessors / transistors / integrated circuits / less maintenance / replaced / reduced / artificial / parallel",
      "1. Abacus used to perform basic ____: addition, subtraction, multiplication, division.",
      "2. The first machine ____ today’s modern computers was The Analytical Engine.",
      "3. The Analytical Engine designed by British ____ Charles Babbage is often called the father of the computer.",
      "4. The 19th century was a period of ____ of computing theory.",
      "5. In 1936 Konrad Zuse developed the first ____ mechanical computing device (Z1). His ____ led to the advent of the first fully-functioning programmable electro-mechanical ____.",
      "6. The first generation of computers worked on ____.",
      "7. John von Neumann developed the idea of keeping ____ inside the computer’s memory.",
      "8. In the late 1950s and early 1960s, the second generation of computers was developed and could work ten times faster than their ____.",
      "9. The reason for this high speed was the use of ____ instead of vacuum tubes.",
      "10. Third generation computers started using ____ instead of transistors.",
      "11. With the help of integrated circuits, computers become more reliable and fast, require ____, are small in size and generate less heat.",
      "12. In this generation, punch cards were ____ by the mouse and keyboard.",
      "13. In fourth-generation computers, integrated circuits were greatly ____ in size.",
      "14. Fifth-generation computers, also known as modern computers, are still in the development stage and are based on ____ intelligence.",
      "15. Computers of this generation are based on microelectronic technology with high computing power and ____ processing."
    ],
    5: [
      "Счеты использовали для выполнения простых математических действий.",
      "Чарльз Бэббидж считается основоположником компьютеров.",
      "Первое поколение компьютеров использовало электронные лампы.",
      "Во втором поколении компьютеров транзисторы заменили электронные лампы.",
      "Энергопотребление заметно снизилось.",
      "Третье поколение компьютеров начало использовать интегральные схемы вместо транзисторов.",
      "Интегральные схемы состоят из полупроводникового материала, содержащего тысячи крошечных транзисторов.",
      "Четвертое поколение компьютеров использовало микропроцессоры, содержащие тысячи интегральных схем, собранных на одном кремниевом чипе.",
      "Пятое поколение компьютеров считается современным поколением компьютеров и использует искусственный интеллект и параллельную обработку данных."
    ]
  },
  2: {
    3: [
      "mainframe, laptop, touch screen, workstation, tablet, desktop PC.",
      "A large, powerful computer that many people can use at the same time.",
      "A computer that is small enough to be carried around and used where you are sitting.",
      "A screen on a computer, phone, etc. that you touch in order to give it instructions, rather than using a keyboard.",
      "A computer and the area around it where you work in an office.",
      "A small computer that you use by touching the screen.",
      "A computer that is small enough to fit on a desk."
    ],
    4: [
      "computer, browse, smartphone, replace, process, compatible, portable, edit, capabilities, hardware, peripherals",
      "A computer is any device that can receive input, ____ programs, and store and display the output. A smartphone has the same basic ____ as a computer, but it is based on in-built ____, such as CPU, RAM, memory, storage, and software components, such as operating systems and applications. Therefore, it can do anything a ____ does, only in a more ____ way. Wherever you are, you can check your emails, ____ the net, write notes, play videos, ____ photos, etc., on your smartphone. In terms of functionality, a ____ has even more capabilities than a computer. It can function as a GPS, camera, compass, flashlight, modem, and, more than anything, a mobile telephone. However, most computers have stronger hardware than smartphones. Also, external hard drives and printers only work with computers and aren’t generally ____ with smartphones. Although smartphones are technically computers and are ever-increasing in power and ____, it doesn’t seem they’ll completely ____ PCs in many personal or professional settings in the near future."
    ]
  },
  3: {
    3: [
      "Figure 3.1. Computer hardware",
      "Software: system software, application software.",
      "Hardware: CPU (control unit, ALU, registers), main memory (RAM, ROM), peripherals (input devices, output devices, storage devices: magnetic, optical, flash memory)."
    ],
    4: [
      "TEXT B. Multicore processors",
      "core / process instructions / limits / integrated circuit / multithreading / work on / PCs and laptops / applications / clock speeds / increase",
      "The heart of every processor is an execution engine, also known as a (1) ____. The core is designed to (2) ____ and data according to the direction of software programs in the computer's memory. Over the years, designers found that every new processor design had (3) ____. A multicore processor is an (4) ____ that has two or more processor cores attached for enhanced performance and reduced power consumption. These processors also enable more efficient simultaneous processing of multiple tasks, such as with parallel processing and (5) ____. Multicore processors (6) ____ any modern computer hardware platform. Virtually all (7) ____ today build in some multicore processor model. However, the true power and benefit of these processors depend on software (8) ____ designed to emphasize parallelism and (9) ____ (10) ____."
    ],
    5: [
      "Главная память, подключаемые устройства и центральный процессор составляют аппаратное обеспечение компьютера.",
      "Центральный процессор состоит из блока управления, арифметико-логического устройства и регистров.",
      "Регистр инструкции хранит выполняемые в данный момент инструкции, в то время как программный счетчик отслеживает следующую команду, подлежащую обработке в оперативной памяти.",
      "Основная память содержит инструкции, которые обрабатываются центральным процессором.",
      "Носители информации могут быть классифицированы по способу хранения информации: оптические, магнитные и полупроводниковые.",
      "Все вторичные устройства хранения являются энергонезависимыми, что значит, что данные сохраняются даже при выключенном компьютере."
    ]
  },
  4: {
    3: [
      "Types of Memory",
      "perform / memory / currently / boot / faster / order / read",
      "Memory is the most essential element of a computing system because without it a computer can’t (1) ____ simple tasks. Both types of (2) ____ (RAM and ROM) are important for the computer, but they serve different purposes. RAM is used to store data that the computer is (3) ____ using, while ROM is used to store data that the computer needs to (4) ____ and operate. RAM is (5) ____ than ROM, as the data stored in it can be accessed and modified in any (6) ____, while data stored in ROM can only be (7) ____."
    ],
    4: [
      "by / to / in / off / without / to / for / into",
      "1. Static RAM is constantly refreshed ____ electricity to store data.",
      "2. RAM is a type of computer memory that is used ____ temporarily store data that the computer is currently using or processing.",
      "3. RAM is volatile memory, which means that the data stored ____ it is lost when the power is turned ____.",
      "4. The computer cannot run ____ the CPU cache.",
      "5. ROM is typically used ____ store the computer’s BIOS, which contains the instructions ____ booting the computer, as well as firmware for other hardware devices.",
      "6. ROM is further classified ____ four types: MROM, PROM, EPROM, and EEPROM."
    ],
    5: [
      "Первичная память может быть энергонезависимой и энергозависимой.",
      "Оперативная память делится на статическую и динамическую.",
      "Ячейки динамической оперативной памяти состоят из транзистора и конденсатора.",
      "Статическая оперативная память представляет собой схему на основе триггеров.",
      "Программное обеспечение базовой системы ввода/вывода хранится в постоянном запоминающем устройстве.",
      "Скорость центрального процессора равна скорости кэша первого уровня.",
      "Есть два типа записи в кэш: сквозная запись и обратная запись.",
      "Кэш относится к статической оперативной памяти.",
      "Важно убедиться, что кэш и оперативная память содержат согласованные данные."
    ]
  },
  5: {
    1: [
      "How can you explain the term “secondary storage”?",
      "What devices refer to secondary storage media?",
      "How is data stored on magnetic storage devices?",
      "What do magnetized and demagnetized areas denote on a disc?",
      "Why is SSD being replaced by HDD in modern computers?",
      "What components do SSDs consist of?",
      "What is the difference between seek time and transfer rate?",
      "What are the main formats of optical storage devices?",
      "What are pros and cons of optical storage media?",
      "What disadvantages of an HDD can you name?",
      "Which secondary storage doesn’t refer to hardware and is stored on remote servers?"
    ],
    2: [
      "Magnetic storage devices store data by magnetizing particles on a disk or tape.",
      "Magnetized tiny area of the plate denotes a binary one.",
      "Secondary storage devices come in various forms, including hard disk drives (HDDs), solid-state drives (SSDs), optical discs, USB flash drives, and magnetic tape.",
      "SSD is an example of a primary storage device.",
      "Hard drives are very resistant to vibration, especially when they are operating.",
      "Optical storage devices offer lesser capacity than magnetic ones.",
      "CDs, DVDs and Blu-ray discs are commonly used optical storage devices in today's market."
    ],
    4: [
      "USB port, USB drive, flash drives, DVDs, transfer rate, circuit board, durability, flash memory, capacities, compatibility",
      "A flash drive, also known as a ____, pen drive, or thumb drive, is a small storage device that uses ____ to store data. ____ connect to computers and other devices via a ____. They provide a convenient way to store, back up, and transfer files between devices. Flash drives come in a range of storage ____, from a few gigabytes up to multiple terabytes. The small size and ____ make them convenient for transporting and sharing data. Compared to older data storage formats like CDs, ____, and external hard drives, flash drives have many benefits. They are lightweight, portable, reusable, and rewritable. They have high data ____ for quick saving and accessing of files and wide ____ with computers, phones, tablets, TVs, and game consoles. The key components found inside a typical flash drive are a USB connector, a ____, NAND flash memory chips, and a casing."
    ]
  },
  6: {
    2: [
      "An operating system is a base on which all the other applications of the system run.",
      "A single-user operating system is designed to support a single device at a time.",
      "Spreadsheets are commonly used for database management.",
      "In preemptive multitasking the computing time is divided between processes as the operating system allocates a time slice for each process.",
      "Common desktop operating systems include Apple iOS and Google Android.",
      "Users can interact directly with the operating system through a command-line interface (CLI).",
      "CLI uses WIMP environment to run different programs."
    ]
  },
  7: {
    6: [
      "Сеть — это совокупность компьютеров, сетевых устройств и периферийных устройств, подключенных для обмена данными.",
      "Самая крупная из существующих глобальных сетей — это Интернет, который соединяет миллионы людей по всему миру.",
      "Локальные сети охватывают небольшую географическую область, например офис, дом, здание или группу зданий.",
      "В одноранговой сети все компьютеры имеют одинаковые возможности — совместно используют файлы и периферийные устройства без необходимости использования отдельного серверного компьютера.",
      "Все узлы подключены к одному кабелю, который является магистралью в топологии шины.",
      "В проводной локальной сети два или более компьютера соединяются посредством таких средств связи, как коаксиальный кабель или кабель витой пары.",
      "В компьютерных сетях используются разные сетевые устройства, например модемы, маршрутизаторы, концентраторы, коммутаторы, мосты, шлюзы и т. д."
    ]
  },
  8: {
    3: [
      "The World Wide Web",
      "collection / URLs / website / hyperlinks / related data / keyword / a project",
      "The world wide web is a (1) ____ of all the web pages and web documents that you can see on the Internet by searching their (2) ____ on the Internet. For example, https://www.geeksforgeeks.org/ is the URL of the GFG (3) ____, and all the content of this site like webpages and web documents are stored on the world wide web. It provides users with a huge array of documents that are connected to each other by means of hypertext or (4) ____. Here, hyperlinks are known as electronic connections that link the (5) ____ so that users can easily access the related information. Hypertext allows the user to pick a word or phrase from text, and using this (6) ____ or word or phrase can access other documents that contain additional information related to that word or keyword or phrase. The world wide web is (7) ____ which was created by Timothy Berners-Lee in 1989 for researchers to work together effectively at CERN."
    ],
    4: [
      "Доступ к Интернету обеспечивается с помощью оптоволоконных и медных проводов (витая пара, коаксиальный кабель).",
      "У каждого персонального компьютера есть IP-адрес, предоставляемый интернет-провайдером.",
      "При коммутируемом доступе к Интернету нужно провести телефонные линии.",
      "Технология Wi-Fi использует радиоволны, чтобы передавать сигнал.",
      "Модем преобразует цифровой сигнал в аналоговый и наоборот.",
      "Цифровая абонентская линия является более быстрым вариантом доступа к Интернету, чем коммутируемый доступ.",
      "Сотовая сеть обеспечивает беспроводной доступ через специальные базовые станции (сотовые вышки) для передачи сигнала.",
      "Оптоволоконный кабель имеет значительные преимущества по сравнению с медным проводом.",
      "Протокол передачи файлов (FTP) был разработан для передачи данных между клиентом и сервером.",
      "Пропускная способность данных влияет на количество данных, передаваемых в сети."
    ]
  },
  9: {
    3: [
      "ranking / URL / query / meta-search engines / directories / crawler-based search engine / indexing",
      "A search engine is a software program that searches a database of information according to the user’s ____.",
      "There are three basic steps that every ____ follows before showing search results.",
      "The bots collect and store data from the web pages, which is called ____.",
      "The ordering of search results by relevancy is known as ____.",
      "A short description along with the website ____ is submitted to the directory for approval.",
      "Yahoo! Directory, Open Directory and LookSmart can serve as good examples of web ____.",
      "Dogpile, MetaCrawler, and SavvySearch are a few examples of such ____."
    ],
    4: [
      "Сегодня в Интернете доступно множество различных поисковых систем для сбора и обработки информации.",
      "Поисковая система использует веб-сканеры/поисковые боты для сбора информации в интернете.",
      "Когда пользователь вводит поисковый запрос, поисковая система выполняет поиск по индексу, чтобы найти релевантный контент.",
      "Автоматизированные поисковые системы, такие как Google, почти вытеснили управляемые человеком каталоги.",
      "Ключевые слова, введённые в поле поиска, будут соответствовать описанию сайта.",
      "Новые URL должны быть сначала проиндексированы и выведены вместо старых.",
      "Мета-поисковые системы не имеют собственной базы данных проиндексированных страниц."
    ]
  },
  10: {
    2: [
      "The only language that a computer understands is the source code.",
      "Programming languages are divided into 2 broad categories: low-level and high-level languages.",
      "Machine languages consist of the 0s and 1s and are defined by hardware design.",
      "Assemblers are translator programs created for converting object code into source code.",
      "Software developers use abbreviations such as ADD, SUB, MPY to represent instructions.",
      "High-level languages are based on the English language grammar and syntax.",
      "An interpreter translates the source code into machine code in one go."
    ],
    3: [
      "assembly language, program, compiler, machine code, high-level language, programming.",
      "assembly language: low-level language translated into machine code by an assembler.",
      "program: a set of instructions which a computer uses to do a specific task.",
      "compiler: software that converts a source program into machine code.",
      "machine code: basic language which consists of binary codes.",
      "high-level language: programming language such as C, C++, Python, Java.",
      "programming: writing computer programs."
    ],
    4: [
      "language, abstraction, machine code, assembly, compiler, high level, programming",
      "Ada Lovelace invented the first-ever machine algorithm for Charles Babbage’s Difference Machine that laid the foundation for all (1) ____ languages. It was 1949 when an assembly language was firstly used. (2) ____ language was a type of low-level programming language that simplified the language of (3) ____. In 1952 Autocode was developed by Alick Glennie. It was the first compiled language that directly converts into machine code using a (4) ____. In 1954 FORTRAN was developed by a team in IBM and became one of the first popular (5) ____ languages. Owing to Fortran the concept of high-level (6) ____ was introduced. There was still time for high-level languages such as Java, C, and C++ to come out. The rapid growth of the internet has become a major point in the programming (7) ____ world which is still improving."
    ],
    5: [
      "Высокоуровневые языки появились в 1970-х годах.",
      "В отличие от низкоуровневых языков программирования языки высокого уровня используют элементы естественного языка.",
      "Языки машинного кода и ассемблера называются языками низкого уровня, потому что они ближе к аппаратному обеспечению.",
      "Большинство компиляторов переводит программу с высокоуровневого языка программирования в машинный код.",
      "Компьютерные системы понимают только двоичный язык, то есть язык нулей и единиц.",
      "C++, Python, Java и C# являются популярными языками объектно-ориентированного программирования (OOP).",
      "Низкоуровневый язык программирования не требует использования компилятора или интерпретатора.",
      "Python используется в анализе данных, веб-разработке, в сфере искусственного интеллекта и разработке игр."
    ]
  },
  11: {
    2: [
      "Web designers use Hyper Text Markup Language because computers understand only this language.",
      "HTML consists of commands called hyperlinks.",
      "HTML, CSS, and JavaScript are dominating web designing tools.",
      "Whereas HTML & CSS are used to control the behavior of different web elements, JavaScript is used to control presentation, formatting, and layout.",
      "An icon is an element in an HTML document that links to a part of the document or to a document altogether.",
      "Most text files are available in two formats: CSS or FTP."
    ],
    3: [
      "Instructions in HTML are called tags.",
      "Cascading Style Sheets are the way to define the presentation of webpages, from fonts and colours to page layout.",
      "A hyperlink is any clickable text, image or button that takes you to another place on the Web.",
      "HTML elements give information about the web page itself, create lists, tables, and forms.",
      "Graphics is used for processing image data received from the physical world, such as photo and video content."
    ],
    4: [
      "frame, layout, tag, HTML, CSS, hyperlink",
      "frame: rectangular areas that allow the display of different pages in the same browser window.",
      "layout: a structured arrangement of items within certain limits.",
      "tag: an element inserted in documents or files that changes the look of content or performs an action with HTML, XML, and other markup languages.",
      "HTML: the code behind most web pages.",
      "CSS: a simple mechanism for adding style to web documents.",
      "hyperlink: highlighted text or pictures that act as links to other pages."
    ],
    5: [
      "6 августа 1991 года Бернерс-Ли запустил первую в мире веб-страницу.",
      "HTML — это код, используемый для описания структуры информации на веб-странице.",
      "Текст — это самый важный элемент любого веб-сайта.",
      "CSS — это основная технология всемирной паутины наряду с HTML и JavaScript.",
      "JavaScript используется разработчиками для того, чтобы сделать веб-страницы интерактивными и удобными для пользователя.",
      "Веб-страница может содержать текст, графику и гиперссылки на другие веб-страницы и файлы.",
      "На веб-страницах гиперссылки обычно окрашены в фиолетовый или синий цвет.",
      "Frontend- и backend-разработка тесно связаны между собой и не могут существовать самостоятельно."
    ]
  },
  12: {
    2: [
      "routine | function",
      "1) misdirection | a) does the damage",
      "2) reproduction | b) attaches a copy of itself to another program",
      "3) trigger | c) hides the presence of the code",
      "4) payload | d) decides when and how to activate the payload"
    ],
    3: [
      "ransomware / a worm / salami shaving / a keylogger / hijacking / a DDoS attack / defacing / piggybacking / a Trojan horse / software piracy / virus / overwriting virus / resident virus / host",
      "ransomware: a type of malicious software designed to block access to a computer system until a sum of money is paid.",
      "a worm: self-propagating malicious code that can automatically distribute itself from one computer to another through network connections.",
      "salami shaving: one of the tactics to steal money, which means the hacker steals the money in small amounts.",
      "a keylogger: spyware used to monitor and record each keystroke on a specific keyboard. The information is gathered and sent to the attacker. This malware is most often used for stealing passwords.",
      "hijacking: the illegal redirection of a user’s browser from a trusted domain’s page to a fake domain without the user’s consent.",
      "a DDoS attack: swamping a server with large numbers of requests.",
      "defacing: changing the information shown on another person’s website.",
      "piggybacking: using another person’s identification code or using that person’s files before he or she has logged off.",
      "a Trojan horse: adding concealed instructions to a computer program so that it will still work but will also perform prohibited duties.",
      "software piracy: unauthorized copying of a program for sale or distribution to other users.",
      "virus: a harmful program that infects a computer.",
      "overwriting virus: a virus that erases information by replacing it.",
      "resident virus: a virus that is dormant until activated.",
      "host: a computer or program that carries a virus."
    ],
    4: [
      "Условно бесплатное и бесплатное программное обеспечение скачивается чаще всего.",
      "У условно бесплатного ПО, как правило, есть пробный период.",
      "Есть ряд мер, которые блокируют установку вирусов, червей, шпионских программ и другого вредоносного программного обеспечения.",
      "Процедура дезориентации, процедура воспроизводства (самокопирования), активация и полезная нагрузка составляют основу любого вируса.",
      "Пользователи могут видеть только последнюю стадию вируса — полезную нагрузку.",
      "Существует несколько видов вредоносного программного обеспечения — вирус, червь и троян.",
      "Пиратство — это нарушение авторских прав.",
      "Фишинг — это незаконная попытка получения паролей и данных кредитных карт.",
      "Червь может распространяться по сети без вмешательства человека."
    ]
  },
  13: {
    2: [
      "уклоняться от обнаружения / вредоносные намерения / проверяются на наличие вирусов / обнаружение сигнатурным способом / эвристическое сканирование / бесплатное ПО / открытый текст / обезвреживает и удаляет вредоносные программы / на основе выбранных вами настроек / настройки по умолчанию"
    ],
    3: [
      "data encryption / biometric security devices / password / uninterruptible power supply / surge protector / antivirus program / shareware / backup set",
      "data encryption: a method of preserving data confidentiality by transforming it into ciphertext, which can only be decoded using a unique decryption key produced at the time of the encryption or prior to it.",
      "biometric security devices: security devices that measure some aspect of a living being, e.g. a fingerprint reader or an eye scanner.",
      "password: a secret code used to control access to a network system.",
      "uninterruptible power supply: a battery backup system that automatically provides power to a computer when the normal electricity source fails.",
      "surge protector: an electronic device that protects equipment from damage due to a sudden surge in power supply.",
      "antivirus program: a computer program or set of programs used to detect, identify and remove viruses from a computer system.",
      "shareware: software that is free to try out but must be paid for if it is used after the trial period.",
      "backup set: a series of incremental backups and a full backup, or the most recent differential backup and a full backup."
    ],
    4: [
      "to back up / shareware / public domain software / differential backup / incremental backup | to deny access / encryption / firewall / default settings / signature verification"
    ],
    5: [
      "Некоторые антивирусные программы запрашивают разрешение, перед тем как удалить вредоносный код.",
      "Если вы предпочитаете автоматический подход к удалению вредоносного ПО, вы можете настроить антивирус таким образом, чтобы он не спрашивал разрешение перед удалением вредоносных файлов.",
      "Не заходите на подозрительные сайты и не скачивайте там информацию.",
      "Пароли, состоящие только из цифр, не являются достаточно надежными.",
      "Скачивая бесплатное или условно бесплатное программное обеспечение, убедитесь в том, что вы взяли его у надежного поставщика ПО.",
      "Любые компании могут столкнуться с проблемами кибербезопасности.",
      "Надежное ПО является одним из самых эффективных способов защиты от киберугроз.",
      "Ваши конфиденциальные данные могут быть взломаны злоумышленниками.",
      "У каждого вредоносного ПО есть отличительная особенность — сигнатура."
    ]
  },
  14: {
    2: [
      "compatible / insights and predictions / sensitive data / data / vulnerable / networks / convolutional layers / the output",
      "IoT devices from different manufacturers may not be ____ with each other, causing interoperability issues and hindering their adoption.",
      "IoT devices collect data, while AI systems analyze data to provide ____.",
      "AI systems can collect ____, raising concerns about privacy and data protection.",
      "AI systems require large amounts of ____ to learn and improve, which can be a challenge in some industries.",
      "IoT devices are ____ to cyber attacks, which can compromise sensitive data and cause damage to businesses.",
      "Backpropagation is a widely used algorithm for training neural ____.",
      "Convolutional neural network (CNN) is a computational model that uses a variation of multilayer perceptrons and contains one or more convolutional layers that can be either entirely connected or pooled.",
      "Recurrent neural networks (RNN) are more complex. They save ____ of processing nodes and feed the result back into the model."
    ],
    3: [
      "для изменения весов соединений / обнаружения мошенничества / входные и выходные данные / взаимодействует с каждым элементом в другом слое / большинство нейросетей — полносвязные / свёрточная нейронная сеть | обучение нейронных сетей / настроить (подобрать) ответы / автоматизировать процессы и уменьшить затраты на рабочих местах / скрытые элементы / нейросети — «чёрные ящики» / пользователи вносят данные и получают ответы / рекуррентная нейронная сеть"
    ],
    4: [
      "Нейронная сеть — это метод в искусственном интеллекте, который учит компьютеры обрабатывать данные таким же способом, как и человеческий мозг.",
      "Нейросети способны выполнять целый набор сложных задач в разных сферах науки и бизнеса.",
      "Искусственные нейронные сети состоят из нескольких слоев — входных, скрытых, выходных.",
      "Примеры устройств интернета вещей включают умные мобильные телефоны, умные часы, фитнес-трекеры, а также виртуальные помощники, такие как Alexa и Google Home.",
      "Интернет вещей (IoT) — способ обмена информацией между несколькими устройствами, подключенными к единой сети.",
      "Интернет вещей (IoT) помогает собирать, анализировать, обрабатывать и передавать данные без участия человека — через ПО или приложения.",
      "Свёрточная нейронная сеть — на сегодняшний день самая популярная нейросеть.",
      "Рекуррентная нейронная сеть (нейронная сеть с обратной связью) — более сложный вариант нейросети."
    ]
  },
  15: {
    4: [
      "Я уже 3 года работаю full-stack-разработчиком в этой компании.",
      "Мой брат — сетевой инженер в крупной компании, поэтому я тоже решил выбрать IT-сферу.",
      "Аналитик данных использует средства машинного обучения для анализа и обработки данных.",
      "Чтобы работать инженером программного обеспечения, достаточно получить степень бакалавра.",
      "Архитектор облачных технологий создаёт системы для управления, мониторинга и обслуживания облачных систем.",
      "Облачные технологии — новая отрасль IT-сферы, которая очень востребована сегодня.",
      "Сколько зарабатывает опытный инженер по аппаратному обеспечению?",
      "Какими знаниями и умениями должен обладать специалист по информационной безопасности?"
    ]
  }
};

const titleOverrides = {
  10: {
    2: "Say whether the sentences are true or false. If they are false, correct them"
  },
  11: {
    2: "Say whether the sentences are true or false. If they are false, correct them",
    5: "Translate the following sentences into English"
  },
  12: {
    2: "Match each virus routine (1–4) to its function (a–d):"
  },
  13: {
    2: "Translate the following terms into English:",
    4: "Translate the following terms into Russian:"
  },
  14: {
    3: "Translate into English according to the text above"
  }
};

const translationTask = {
  1: 5,
  3: 5,
  4: 5,
  7: 6,
  8: 4,
  9: 4,
  10: 5,
  11: 5,
  12: 4,
  13: 5,
  14: 4,
  15: 4
};

for (const unit of data.units) {
  const parsedUnit = parsed["unit_" + unit.id];
  if (!parsedUnit) throw new Error("Missing parsed unit " + unit.id);
  if (parsedUnit.tasks.length !== unit.tasks.length) {
    throw new Error(
      "Task count mismatch for unit " + unit.id + ": " + unit.tasks.length + " vs " + parsedUnit.tasks.length
    );
  }

  unit.tasks = unit.tasks.map((oldTask, index) => {
    const parsedTask = parsedUnit.tasks[index];
    const override = overrides[unit.id] && overrides[unit.id][index];
    const titleOverride = titleOverrides[unit.id] && titleOverrides[unit.id][index];
    return {
      num: oldTask.num,
      title: titleOverride || parsedTask.title || oldTask.title,
      body: override || parsedTask.body
    };
  });

  const tIndex = translationTask[unit.id];
  if (tIndex !== undefined) {
    unit.translation_sentences = unit.tasks[tIndex].body.slice();
  }
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("Wrote", dataPath);
