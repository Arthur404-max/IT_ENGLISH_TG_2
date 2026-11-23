/* Собирает data/exams.json из учебных материалов.
   Запуск: node tools/build_exams.js */
const fs = require("fs");
const path = require("path");

const unitsFile = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "units.json"), "utf8"));
const unitMap = new Map((unitsFile.units || []).map((unit) => [Number(unit.id), unit]));

const unitLabel = (unitId) => {
  const unit = unitMap.get(Number(unitId));
  return `Unit ${String(unitId).padStart(2, "0")}${unit ? ` · ${unit.title_en}` : ""}`;
};

const sourceFor = (unitId, tab = "vocab") => ({
  source: unitLabel(unitId),
  source_tab: tab,
});

const textSource = (text) => {
  const unit = unitMap.get(Number(text.unit_id));
  const found = unit && (unit.texts || []).find((item) => item.title === text.title);
  const letter = found ? `Text ${found.letter} · ` : "";
  return {
    source: `${unitLabel(text.unit_id)} · ${letter}«${text.title}»`,
    source_tab: "text",
  };
};

const questions = [
  {
    id: 1, unit_id: 1,
    q: `How many generations of computers are there? What is the difference between them? In what way have computers been changing over time?`,
    a: `There are five generations of computers. The first generation used vacuum tubes, the second used transistors, the third used integrated circuits, the fourth used microprocessors and VLSI circuits, and the fifth is based on artificial intelligence, high computing power and parallel processing. Over time computers have become smaller, faster, more reliable and less expensive, and they consume less energy.`
  },
  {
    id: 2, unit_id: 1,
    q: `Who is usually called “the father of the computer”?`,
    a: `Charles Babbage is usually called the father of the computer. In the 1830s he designed the Analytical Engine, which contained an arithmetic logic unit, a control unit, memory and an input/output system. These are the essential parts of a modern computer.`
  },
  {
    id: 3, unit_id: 1,
    q: `Talk about the distinctive feature of the early computers and the people who contributed most to the development of computer technologies.`,
    a: `The first counting tools were sticks and stones, and the abacus was invented in China around 1300 BC. Blaise Pascal built the Pascaline, a mechanical adding machine, between 1642 and 1644. Charles Babbage designed the Analytical Engine, and Konrad Zuse created the Z1, the first programmable mechanical computing device, in 1936. These inventions led to the first fully functioning programmable electromechanical computer.`
  },
  {
    id: 4, unit_id: 2,
    q: `What are the differences between the main types of computers (mainframes, supercomputers, desktop PCs, laptops, and tablets)?`,
    a: `Mainframes handle huge amounts of data and many users at the same time. Supercomputers are the most powerful computers and are used for one very complex task, for example complex calculations or simulations. Desktop PCs are general-purpose computers for individual use. Laptops are portable personal computers with a screen, keyboard and touchpad. Tablets are wireless touchscreen devices that are smaller and lighter than laptops.`
  },
  {
    id: 5, unit_id: 2,
    q: `What are the similarities between smartphones and tablet PCs?`,
    a: `Both smartphones and tablets are portable wireless devices with touchscreens. They use mobile operating systems, run applications, connect to the Internet and are used for communication, reading, watching videos, taking photos and playing games. They are smaller and less powerful than desktop computers.`
  },
  {
    id: 6, unit_id: 3,
    q: `What is the difference between hardware and software?`,
    a: `Hardware is any electronic or mechanical part of a computer that you can see and touch, such as the CPU, memory and peripherals. Software is a set of instructions, rules or programs that tell the computer what to do. Hardware is the physical equipment, while software is the logical part of the system.`
  },
  {
    id: 7, unit_id: 3,
    q: `What are the most important hardware components in a computer system? Explain your choice. Talk about the function of each of the component you have named.`,
    a: `The most important components are the CPU, main memory and input/output devices. The CPU executes program instructions and coordinates the system; it contains the control unit, ALU and registers. Main memory, or RAM, stores the data and instructions that are being processed. Input devices send data into the computer, and output devices show the results. Storage devices keep data permanently.`
  },
  {
    id: 8, unit_id: 3,
    q: `What types of peripherals do you know? Talk about each of them.`,
    a: `Peripherals are physical units attached to the computer. They include storage devices, such as hard drives, DVD drives and flash drives, input devices, such as the keyboard and mouse, and output devices, such as the monitor and printer. Storage devices provide permanent storage of data and programs.`
  },
  {
    id: 9, unit_id: 3,
    q: `What are the three main parts of the CPU? Talk about the functions of each of them.`,
    a: `The CPU consists of the control unit, the arithmetic logic unit and registers. The control unit interprets instructions and causes other components to execute them. The ALU performs mathematical calculations and logical operations. Registers are high-speed memory units inside the CPU: the program counter keeps track of the next instruction, and the instruction register holds the instruction being executed.`
  },
  {
    id: 10, unit_id: 3,
    q: `What is the performance of the CPU affected by?`,
    a: `CPU performance is partly determined by clock speed, which is measured in gigahertz. It also depends on the number of cores and the ability to process multiple tasks at the same time, as well as on cache size and the speed of memory access.`
  },
  {
    id: 11, unit_id: 4,
    q: `What is cache memory? What is its function? What is ‘write-through’ cache and ‘write-back’ cache?`,
    a: `Cache memory is a small, fast memory between the CPU and main memory. It stores copies of recently used data and increases the speed of access. In a write-through cache, data is updated in both the cache and main memory at the same time. In a write-back cache, changes are written only to the cache first, and main memory is updated when the cache block is replaced.`
  },
  {
    id: 12, unit_id: 4,
    q: `What is cache hit/ cache miss?`,
    a: `A cache hit occurs when the processor finds the needed memory location in the cache, so the data is read from the cache. A cache miss occurs when the data is not in the cache; then the processor accesses main memory and copies the data into the cache.`
  },
  {
    id: 13, unit_id: 4,
    q: `Talk about RAM and ROM. Talk about different types of ROM.`,
    a: `RAM is volatile memory that stores the data and instructions currently being processed; its contents are lost when the computer is turned off. ROM is non-volatile memory that contains instructions for basic operations, such as the BIOS. ROM types include MROM, PROM, EPROM, EEPROM and flash ROM.`
  },
  {
    id: 14, unit_id: 4,
    q: `What is the difference between primary memory and secondary storage devices? Give examples of primary memory and secondary storage media.`,
    a: `Primary storage is internal memory that the CPU can access directly with minimum or no delay. It includes RAM, ROM and cache. Secondary storage is non-volatile, slower and has a larger capacity; examples are hard disk drives, SSDs, optical discs and flash drives.`
  },
  {
    id: 15, unit_id: 5,
    q: `Give at least two possible classifications of storage devices.`,
    a: `Storage devices can be classified by technology into magnetic, optical and flash memory devices. They can also be classified into primary and secondary storage. Another classification is by access method: direct access and sequential access.`
  },
  {
    id: 16, unit_id: 5,
    q: `Talk about a hard disk drive. Describe its construction and formatting process.`,
    a: `A hard disk drive contains one or more platters inside an air-sealed casing. Data is written and read by a magnetic head that moves over the spinning platters. During formatting the disk is divided into tracks, sectors and clusters, so the operating system can store and find files. Seek time is the average time needed to find data, and transfer rate is the speed of transmitting data.`
  },
  {
    id: 17, unit_id: 5,
    q: `What are the differences between a CD and a DVD in terms of the internal structure?`,
    a: `CDs and DVDs are optical discs that store data as pits read by a laser. A DVD has smaller pits and a narrower track pitch than a CD, so it can store much more data. DVDs can also use multiple layers and sides, while a standard CD usually has one layer and one side.`
  },
  {
    id: 18, unit_id: 5,
    q: `What are the advantages and disadvantages of optical discs over magnetic disks?`,
    a: `Optical discs are durable, portable and not affected by magnetic fields. Their disadvantages are lower speed and smaller capacity compared with modern hard drives. Magnetic disks offer greater capacity and a lower price, but they have moving parts and are more sensitive to shocks and magnetic fields.`
  },
  {
    id: 19, unit_id: 5,
    q: `Compare an HDD and an SSD.`,
    a: `An HDD stores data magnetically on spinning platters and has moving parts. An SSD uses flash memory chips, has no moving parts, is faster, quieter and more resistant to shocks, but it is usually more expensive. Both are non-volatile secondary storage devices.`
  },
  {
    id: 20, unit_id: 6,
    q: `What is the difference between system software and application software? Give examples of system software and application software.`,
    a: `System software operates and manages the computer system; examples are operating systems, firmware and device drivers. Application software helps the user perform specific tasks; examples are word processors, spreadsheets, web browsers and database software.`
  },
  {
    id: 21, unit_id: 6,
    q: `What is an operating system? What are the main functions of an operating system?`,
    a: `An operating system is software that acts as an intermediary between application programs and computer hardware. Its main functions are to manage computer resources such as the CPU and disk drives, establish a user interface, and execute and provide services for application software.`
  },
  {
    id: 22, unit_id: 6,
    q: `How can operating systems be classified?`,
    a: `Operating systems can be classified by the number of users into single-user and multi-user systems, by the number of tasks into single-tasking and multitasking systems, and by purpose into desktop, mobile and real-time operating systems. Multitasking systems can be preemptive or cooperative.`
  },
  {
    id: 23, unit_id: 6,
    q: `What is the difference between CLI and GUI?`,
    a: `A CLI, or command line interface, requires the user to type commands to run programs. A GUI, or graphical user interface, lets the user click icons and choose commands from menus. A GUI uses the WIMP environment: windows, icons, menus and a pointer.`
  },
  {
    id: 24, unit_id: 6,
    q: `What is an application program? What are the main types of application programs?`,
    a: `An application program is software designed to help the user perform specific tasks. The main types are word processors, spreadsheets, database software, web browsers, presentation software and graphics programs.`
  },
  {
    id: 25, unit_id: 6,
    q: `Talk about the benefits of using open-source software.`,
    a: `Open-source software has publicly visible and editable source code. Users can study, modify and improve it, it is often free, and it can be adapted to specific needs. It also encourages collaboration and reduces dependence on one vendor.`
  },
  {
    id: 26, unit_id: 6,
    q: `Talk about the benefits of proprietary software.`,
    a: `Proprietary software is owned by a vendor who controls updates and support. It often provides professional support, tested updates, security and a complete package of features. Users do not need to modify the code themselves.`
  },
  {
    id: 27, unit_id: 7,
    q: `How can networks be classified? Talk about different types of networks.`,
    a: `Networks can be classified by geographical area into LAN, MAN and WAN. They can also be classified by architecture into client-server and peer-to-peer networks, and by physical medium into wired and wireless networks.`
  },
  {
    id: 28, unit_id: 7,
    q: `Talk about different networking hardware and specify their function.`,
    a: `Network devices include modems, routers, hubs, switches, bridges and gateways. A modem converts signals for transmission over a line; a router forwards packets between networks; a hub broadcasts data to all devices; a switch sends data to the correct device; a bridge connects network segments; a gateway connects networks with different protocols.`
  },
  {
    id: 29, unit_id: 7,
    q: `Talk about the difference between a hub, a switch, and a router.`,
    a: `A hub broadcasts data to every connected device and works at Layer 1. A switch inspects packets and sends them only to the destination device; it works at Layer 2. A router connects different networks and forwards packets to their IP addresses; it works at Layer 3.`
  },
  {
    id: 30, unit_id: 7,
    q: `What types of network topology can you name? Describe each of them.`,
    a: `The main topologies are star, bus, ring, tree, mesh and hybrid. In a star network all nodes connect to a central node. In a bus network all nodes share one backbone cable. In a ring network each device connects to its neighbours. Tree topology combines bus and star. Mesh topology connects nodes directly to many other nodes. Hybrid topology combines several topologies.`
  },
  {
    id: 31, unit_id: 7,
    q: `What type of topology is considered the most/ least robust? Why?`,
    a: `Mesh topology is considered the most robust because nodes have multiple paths to each other, so the network continues working if one connection fails. A bus topology is the least robust because a failure of the main cable can stop the whole network.`
  },
  {
    id: 32, unit_id: 7,
    q: `Talk about the benefits and downsides of wired and wireless networks.`,
    a: `Wired networks provide a stable, fast and secure connection, but they require cables and are less convenient to move. Wireless networks are convenient, flexible and easy to install, but their signal can be affected by distance, walls and interference, and they may be less secure.`
  },
  {
    id: 33, unit_id: 7,
    q: `Talk about the seven layers of the OSI model. Name them and specify the function of each of them.`,
    a: `The OSI model has seven layers: physical, data link, network, transport, session, presentation and application. The physical layer transmits raw bits; the data link layer manages frames and MAC addresses; the network layer routes packets using IP addresses; the transport layer provides data transfer using TCP or UDP; the session layer controls sessions; the presentation layer formats and encrypts data; the application layer supports user applications such as HTTP, FTP and email.`
  },
  {
    id: 34, unit_id: 7,
    q: `Talk about the major protocols used at each layer of the OSI model.`,
    a: `At the application layer, protocols include HTTP, HTTPS, FTP and email protocols. The presentation and session layers use format and session services. The transport layer uses TCP and UDP. The network layer uses IP. The data link layer uses Ethernet and MAC addressing, and the physical layer defines the transmission media and signals.`
  },
  {
    id: 35, unit_id: 8,
    q: `What types of wired Internet connection do you know? Talk about each of them.`,
    a: `Wired Internet connections include DSL, cable Internet and fiber-optic Internet. DSL uses telephone lines, cable Internet uses cable TV networks, and fiber-optic Internet uses light signals in fiber-optic cables. Fiber-optic connections are the fastest.`
  },
  {
    id: 36, unit_id: 8,
    q: `What is the difference between DSL and dial-up connection? Talk about the types of DSL.`,
    a: `DSL uses the higher frequency bands of a telephone line for data, so the phone and the Internet can work at the same time. Dial-up uses a phone call to establish a connection and blocks the telephone line while connected. ADSL is the most common DSL type; it is asymmetric because download speed is higher than upload speed.`
  },
  {
    id: 37, unit_id: 8,
    q: `What types of wireless Internet connection do you know? Talk about each of them.`,
    a: `The main wireless Internet technologies are Wi-Fi, cellular and satellite Internet. Wi-Fi uses radio waves for local networking; cellular networks use cell towers; satellite Internet uses a geostationary satellite and a satellite dish.`
  },
  {
    id: 38, unit_id: 8,
    q: `What is the difference between the Internet and WWW?`,
    a: `The Internet is a global network of interconnected computer networks. The World Wide Web is a system of web pages and documents accessible through the Internet using URLs and browsers. The Web is a service that runs on the Internet, not the Internet itself.`
  },
  {
    id: 39, unit_id: 8,
    q: `Compare the OSI model and the TCP/IP model.`,
    a: `The OSI model has seven layers and is a reference model for how data travels over a network. The TCP/IP model is a more concise practical model with four or five layers. TCP/IP was developed for the Internet and is based on standard protocols such as TCP, IP and UDP.`
  },
  {
    id: 40, unit_id: 9,
    q: `Talk about the difference between crawler-based search engines, human-powered directories, and meta-search engines.`,
    a: `Crawler-based search engines, such as Google, compile their listings automatically using crawlers, indexing and ranking. Human-powered directories, such as Yahoo! Directory, use human editors to review and categorize websites. Meta-search engines, such as MetaCrawler, do not have their own index; they combine results from several search engines.`
  },
  {
    id: 41, unit_id: 9,
    q: `Talk about the three steps that every crawler-based search engine takes before displaying search results.`,
    a: `The three steps are crawling, indexing and ranking. A crawler or spider fetches web pages, indexing identifies the keywords that describe each page, and ranking decides which results are most relevant to the user's query.`
  },
  {
    id: 42, unit_id: 10,
    q: `What is the difference between low-level and high-level programming languages? Talk about the function of an assembler, a compiler, and an interpreter.`,
    a: `Low-level languages, such as machine code and assembly language, are close to the hardware and difficult to write. High-level languages are closer to English and easier to use. An assembler translates assembly language into machine code; a compiler translates the whole source program into object code; an interpreter translates the source code line by line while the program runs.`
  },
  {
    id: 43, unit_id: 10,
    q: `What is OOP? Talk about the key features of OOP.`,
    a: `OOP, or object-oriented programming, is a programming style based on objects that combine data and methods. Its key features are encapsulation, inheritance, polymorphism and abstraction. OOP makes code more intuitive, reusable and easier to maintain, and it shortens program-development time.`
  },
  {
    id: 44, unit_id: 10,
    q: `What high-level languages do you know? Talk about their main features and application areas.`,
    a: `Examples of high-level languages are FORTRAN, C, Java and Python. FORTRAN was designed for scientific and engineering computations. C is used for system software, graphics and commercial programs. Java is used for web applications and popularized OOP. Python is used for web development, data analysis and artificial intelligence.`
  },
  {
    id: 45, unit_id: 11,
    q: `What tools are used to build a website? Talk about the features of a good website.`,
    a: `Websites are built with HTML for structure, CSS for styling and layout, and JavaScript for interactivity. A good website is well-structured, easy to navigate, readable, visually attractive, responsive and fast. It should also provide useful content and work correctly in different browsers.`
  },
  {
    id: 46, unit_id: 11,
    q: `What is SEO? What types of SEO can you name?`,
    a: `SEO, or search engine optimization, is the process of improving a website so that it ranks higher in search engine results. The main types are on-page SEO, off-page SEO and technical SEO. On-page SEO works with content, keywords and structure; off-page SEO builds links and reputation; technical SEO improves speed, indexing and mobile usability.`
  },
  {
    id: 47, unit_id: 12,
    q: `What types of malware do you know? Talk about each of them.`,
    a: `Malware is malicious software designed to infiltrate or damage a computer. Types include viruses, worms, Trojans, spyware and adware. A virus needs a host file to activate; a worm self-replicates and spreads through the network; a Trojan is disguised as a useful program; spyware collects information without consent; adware displays unwanted advertisements.`
  },
  {
    id: 48, unit_id: 12,
    q: `What are the four parts of a virus?`,
    a: `A virus has four main parts: a misdirection routine that helps it hide, a reproduction routine that copies it to other programs, a trigger that activates the payload, and a payload that may be harmless or destructive.`
  },
  {
    id: 49, unit_id: 12,
    q: `What types of cybercrime do you know? Talk about each of them.`,
    a: `Cybercrime includes hacking, identity theft, phishing, malware attacks, DDoS attacks and financial fraud. Criminals may steal personal data, bank details or business information, or damage computer systems.`
  },
  {
    id: 50, unit_id: 13,
    q: `How can one protect a computer from malware and cybercrime? Talk about anti-virus software, firewall, encryption/ decryption.`,
    a: `To protect a computer, use antivirus software, a firewall, strong passwords, encryption and regular backups. Do not open attachments from strangers or download files from suspicious websites. Encryption converts data into a secret code, and decryption converts it back with a key. A firewall filters incoming and outgoing packets and blocks unauthorized access.`
  },
  {
    id: 51, unit_id: 14,
    q: `How do you think the field of IT will develop in the future?`,
    a: `IT will continue to develop rapidly. Artificial intelligence, neural networks, the Internet of Things, cloud computing and cybersecurity will become more important. Computers will be more powerful, connected and integrated into everyday life, but issues such as security, privacy and the reliability of AI will also grow.`
  },
  {
    id: 52, unit_id: 14,
    note: `Вопрос опирается на видеоматериал курса; ответ дан на уровне B1 по общепринятому определению.`,
    q: `Talk about the Turing Test. What does the procedure of the Turing Test involve?`,
    a: `The Turing Test was proposed by Alan Turing to check whether a machine can show intelligent behaviour. In the procedure, a human judge communicates with a machine and a human without seeing them. If the judge cannot reliably tell which one is the machine, the machine is considered to have passed the test.`
  },
  {
    id: 53, unit_id: 14,
    note: `Вопрос опирается на видеоматериал курса; ответ дан на уровне B1 по общепринятому определению.`,
    q: `What is HLAI? What are the risks of using HLAI?`,
    a: `HLAI, or human-level artificial intelligence, is AI that performs intellectual tasks at the level of a human. The risks include loss of control, unpredictable behaviour, dependence on AI systems, job displacement, privacy problems and the difficulty of understanding how the AI makes decisions.`
  },
  {
    id: 54, unit_id: 14,
    q: `Describe the construction of an artificial neural network. What tasks can be accomplished by a neural network?`,
    a: `An artificial neural network consists of interconnected nodes, or neurons, arranged in input, hidden and output layers. The connections have weights, and the network learns by adjusting them during backpropagation. Neural networks can perform face recognition, autonomous driving, machine translation, fraud detection, clustering, pattern recognition and prediction.`
  },
  {
    id: 55, unit_id: 14,
    q: `In what way is an artificial neural network similar to a biological brain?`,
    a: `An artificial neural network is similar to a biological brain because it consists of many interconnected neurons that process information in parallel. It receives input, processes it through hidden layers and produces output. It can learn from examples by changing the weights of connections, which resembles learning in the brain.`
  },
  {
    id: 56, unit_id: 14,
    q: `How are units arranged in a fully connected neural network?`,
    a: `In a fully connected neural network, each unit in one layer is connected to every unit in the next layer. The network usually has an input layer, one or more hidden layers and an output layer. The connections are represented by weights that can be positive or negative.`
  },
  {
    id: 57, unit_id: 14,
    q: `What is backpropagation?`,
    a: `Backpropagation is the feedback process by which neural networks learn. The network compares its output with the correct output, calculates the difference and uses it to modify the weights of connections, working backward from the output layer through the hidden layers to the input layer.`
  },
  {
    id: 58, unit_id: 14,
    q: `What problems do professionals come across when working with artificial neural networks?`,
    a: `One problem is the long time needed to train large networks. Another problem is that neural networks are “black boxes”: users receive answers but cannot see the exact decision-making process. There are also issues with data quality, overfitting and the need for large computing resources.`
  },
  {
    id: 59, unit_id: 14,
    q: `What is IoT? How can hardware be classified in the context of IoT devices? Give examples.`,
    a: `IoT, or the Internet of Things, is a system of physical objects that have unique identifiers and can transfer data over a network without human interaction. IoT hardware can be classified into sensors, actuators, communication devices, gateways and embedded controllers. Examples are smart watches, smart home sensors, industrial sensors and connected cars.`
  },
  {
    id: 60, unit_id: 15,
    q: `What jobs in the IT field do you know? Talk about each of them. Which field would you like to work in?`,
    a: `IT offers many jobs, including hardware engineer, software engineer, system administrator, data scientist, IT security specialist, database administrator, network engineer, full-stack developer and IT director. I would like to work as a software engineer because this profession involves designing and writing new software and requires creativity and constant learning.`
  }
];

const terms = [
  [1, "abacus", "абак, счёты", "An early counting tool with beads on wires or rods, used for basic arithmetic."],
  [1, "vacuum tube", "электронная лампа", "An early electronic component that controlled current in a vacuum and was used in first-generation computers."],
  [1, "transistor", "транзистор", "A semiconductor device that amplifies or switches electronic signals and replaced vacuum tubes."],
  [1, "integrated circuit", "интегральная схема", "A small chip containing many electronic components and connections."],
  [1, "microprocessor", "микропроцессор", "A single chip that contains the central processing unit of a computer."],
  [1, "semiconductor", "полупроводник", "A material that conducts electricity only under certain conditions and is used in chips."],
  [1, "artificial intelligence", "искусственный интеллект", "A field of computer science that creates systems able to perform tasks that normally require human intelligence."],
  [1, "punched card", "перфокарта", "A card with holes used to store data and instructions for early computers."],
  [2, "mainframe", "мейнфрейм", "A large, powerful computer that supports many users and processes huge amounts of data."],
  [2, "supercomputer", "суперкомпьютер", "The fastest and most powerful computer, used for complex calculations and simulations."],
  [2, "desktop PC", "настольный компьютер", "A personal computer designed to stay on a desk and used for general tasks."],
  [2, "laptop", "ноутбук", "A portable personal computer with a screen, keyboard and touchpad."],
  [2, "tablet", "планшет", "A portable wireless device with a touchscreen, smaller than a laptop."],
  [2, "server", "сервер", "A computer that provides services and resources to other computers in a network."],
  [2, "wearable computer", "носимый компьютер", "A small computer worn on the body, such as a smart watch."],
  [3, "central processing unit", "центральный процессор", "The main processor that executes instructions and controls the computer."],
  [3, "arithmetic logic unit", "арифметико-логическое устройство", "The part of the CPU that performs arithmetic and logical operations."],
  [3, "control unit", "устройство управления", "The CPU part that decodes instructions and coordinates other components."],
  [3, "register", "регистр", "A small, very fast storage location inside the CPU."],
  [3, "motherboard", "материнская плата", "The main circuit board that connects all computer components."],
  [3, "bus", "шина", "A set of wires or paths that carries data and control signals between components."],
  [3, "peripheral", "периферийное устройство", "A device connected to a computer to provide input, output or storage."],
  [3, "clock speed", "тактовая частота", "The speed at which a CPU performs cycles, measured in gigahertz."],
  [3, "cache memory", "кэш-память", "A small, fast memory between the CPU and main memory that stores recently used data."],
  [4, "random access memory", "оперативная память", "Volatile main memory that stores data and instructions currently in use."],
  [4, "read-only memory", "постоянное запоминающее устройство", "Non-volatile memory that stores permanent instructions such as the BIOS."],
  [4, "basic input/output system", "базовая система ввода-вывода", "Firmware that starts the computer and checks its hardware before loading the operating system."],
  [4, "cache hit", "попадание в кэш", "A situation when the needed data is found in the cache."],
  [4, "cache miss", "промах кэша", "A situation when the needed data is not in the cache and must be loaded from main memory."],
  [4, "static random access memory", "статическая оперативная память", "A fast type of RAM that stores each bit in a flip-flop and does not need refreshing."],
  [4, "dynamic random access memory", "динамическая оперативная память", "A type of RAM that stores data in capacitors and must be refreshed regularly."],
  [4, "flash memory", "флеш-память", "Non-volatile electronic memory that can be erased and rewritten."],
  [5, "hard disk drive", "жёсткий диск", "A magnetic storage device with spinning platters and read/write heads."],
  [5, "solid-state drive", "твердотельный накопитель", "A storage device that uses flash memory and has no moving parts."],
  [5, "optical disc", "оптический диск", "A storage medium that stores data as pits and lands read by a laser."],
  [5, "magnetic tape", "магнитная лента", "A sequential storage medium coated with magnetic material."],
  [5, "seek time", "время доступа", "The average time a hard drive needs to move its head to the requested data."],
  [5, "transfer rate", "скорость передачи", "The speed at which data is transmitted or read from a storage device."],
  [5, "formatting", "форматирование", "The process of preparing a storage medium by creating tracks, sectors and a file system."],
  [5, "partition", "раздел", "A logical section of a storage device that can be formatted and used separately."],
  [6, "operating system", "операционная система", "System software that manages hardware resources and provides services for applications."],
  [6, "system software", "системное программное обеспечение", "Software that controls the computer and provides a platform for application programs."],
  [6, "application software", "прикладное программное обеспечение", "Software designed to help users perform specific tasks."],
  [6, "compiler", "компилятор", "A program that translates the whole source code into machine or object code."],
  [6, "interpreter", "интерпретатор", "A program that translates and executes source code line by line."],
  [6, "command line interface", "интерфейс командной строки", "A user interface in which commands are typed as text."],
  [6, "graphical user interface", "графический интерфейс", "A user interface with windows, icons, menus and a pointer."],
  [6, "open-source software", "программное обеспечение с открытым исходным кодом", "Software whose source code is publicly available and can be modified."],
  [6, "proprietary software", "проприетарное программное обеспечение", "Software owned by a company that controls its use, distribution and source code."],
  [6, "device driver", "драйвер устройства", "Software that allows the operating system to communicate with a hardware device."],
  [6, "firmware", "прошивка", "Software permanently stored in a hardware device, such as the BIOS."],
  [7, "local area network", "локальная сеть", "A network that connects computers in a small area such as an office or school."],
  [7, "wide area network", "глобальная сеть", "A network that covers a large geographical area and connects LANs."],
  [7, "router", "маршрутизатор", "A device that connects networks and forwards packets by IP address."],
  [7, "switch", "коммутатор", "A network device that sends frames only to the destination device in a LAN."],
  [7, "hub", "концентратор", "A network device that broadcasts incoming data to all connected devices."],
  [7, "gateway", "шлюз", "A device that connects networks using different protocols."],
  [7, "network topology", "топология сети", "The physical or logical arrangement of devices and connections in a network."],
  [7, "mesh topology", "ячеистая топология", "A topology in which many nodes are connected to each other, providing multiple paths."],
  [7, "OSI model", "модель OSI", "A seven-layer reference model that describes how data travels over a network."],
  [8, "digital subscriber line", "цифровая абонентская линия", "A high-speed Internet connection that uses ordinary telephone lines."],
  [8, "asymmetric digital subscriber line", "асимметричная цифровая абонентская линия", "A DSL connection with faster download than upload speed."],
  [8, "dial-up connection", "коммутируемое соединение", "An Internet connection established by dialing a phone number, which blocks the phone line."],
  [8, "fiber-optic cable", "оптоволоконный кабель", "A cable that transmits data as pulses of light through thin glass or plastic fibers."],
  [8, "Wi-Fi", "беспроводная локальная сеть", "A wireless technology that connects devices to a network using radio waves."],
  [8, "satellite Internet", "спутниковый интернет", "Internet access provided through a satellite dish and a geostationary satellite."],
  [8, "Internet service provider", "интернет-провайдер", "A company that provides Internet access to users."],
  [9, "search engine", "поисковая система", "A software program that finds web pages and provides results for a user query."],
  [9, "crawler", "поисковый робот", "A program that automatically visits web pages and collects information for a search engine."],
  [9, "indexing", "индексирование", "The process of identifying and storing keywords from web pages in a search index."],
  [9, "ranking", "ранжирование", "The process of ordering search results by their relevance to a query."],
  [9, "meta-search engine", "метапоисковая система", "A search tool that combines results from several search engines instead of using its own index."],
  [10, "programming language", "язык программирования", "A formal language used to write instructions for a computer."],
  [10, "machine code", "машинный код", "Binary instructions that a processor can execute directly."],
  [10, "assembly language", "язык ассемблера", "A low-level language that uses symbolic instructions instead of binary code."],
  [10, "high-level language", "язык высокого уровня", "A programming language that is easier for humans to read and write than machine code."],
  [10, "source code", "исходный код", "The original program text written by a programmer."],
  [10, "object code", "объектный код", "The machine-language output produced by a compiler before linking."],
  [10, "object-oriented programming", "объектно-ориентированное программирование", "A programming style based on objects that combine data and methods."],
  [10, "encapsulation", "инкапсуляция", "The OOP feature of hiding data inside an object and providing controlled access."],
  [10, "inheritance", "наследование", "The OOP feature that allows a class to reuse and extend another class."],
  [10, "polymorphism", "полиморфизм", "The OOP feature that lets different objects respond to the same method in different ways."],
  [11, "web design", "веб-дизайн", "The process of planning the structure, layout and appearance of a website."],
  [11, "hypertext markup language", "язык разметки гипертекста", "The markup language used to structure content on web pages."],
  [11, "cascading style sheets", "каскадные таблицы стилей", "A language used to describe the style and layout of web pages."],
  [11, "JavaScript", "JavaScript", "A programming language used to add interactivity to web pages."],
  [11, "uniform resource locator", "универсальный указатель ресурса", "The address of a resource on the Internet."],
  [11, "hyperlink", "гиперссылка", "A clickable element that opens another web page or resource."],
  [11, "search engine optimization", "поисковая оптимизация", "The process of improving a website's position in search engine results."],
  [12, "malware", "вредоносное программное обеспечение", "Software designed to damage, steal data or gain unauthorized access."],
  [12, "virus", "вирус", "Malicious code that attaches to a host file and reproduces when the file is run."],
  [12, "worm", "червь", "Self-replicating malware that spreads across networks without a host file."],
  [12, "Trojan", "троянский конь", "Malware disguised as a useful program that performs a harmful action."],
  [12, "spyware", "шпионское программное обеспечение", "Malware that secretly collects user information."],
  [12, "adware", "рекламное программное обеспечение", "Software that displays unwanted advertisements."],
  [12, "firewall", "межсетевой экран", "Software or hardware that filters network traffic and blocks unauthorized access."],
  [12, "encryption", "шифрование", "The process of converting plaintext into ciphertext to protect data."],
  [12, "decryption", "дешифрование", "The process of converting ciphertext back into readable plaintext using a key."],
  [13, "backup", "резервное копирование", "A copy of data created so it can be restored after loss or damage."],
  [13, "full backup", "полное резервное копирование", "A backup that copies all selected files and folders."],
  [13, "incremental backup", "инкрементальное резервное копирование", "A backup that copies only files changed since the last backup."],
  [13, "differential backup", "дифференциальное резервное копирование", "A backup that copies files changed since the last full backup."],
  [13, "archive bit", "архивный бит", "A file attribute that shows whether a file has changed since the last backup."],
  [13, "plaintext", "открытый текст", "Data in its original, readable form before encryption."],
  [13, "ciphertext", "шифротекст", "Data that has been transformed by encryption and is unreadable without a key."],
  [13, "biometric security", "биометрическая защита", "Security that uses physical characteristics such as fingerprints or faces for identification."],
  [13, "heuristic scanning", "эвристическое сканирование", "A method that detects new malware by analysing suspicious behaviour rather than known signatures."],
  [14, "artificial neural network", "искусственная нейронная сеть", "A computing model made of interconnected nodes that learns from examples."],
  [14, "neuron", "нейрон", "A node in an artificial neural network that receives, processes and passes information."],
  [14, "weight", "вес", "A number that shows the strength of a connection between two neurons."],
  [14, "backpropagation", "обратное распространение ошибки", "A learning method that adjusts weights by working backward from the output to the input."],
  [14, "convolutional neural network", "свёрточная нейронная сеть", "A neural network with convolutional layers, often used for image recognition."],
  [14, "recurrent neural network", "рекуррентная нейронная сеть", "A neural network that uses feedback and memory to process sequences."],
  [14, "Internet of Things", "интернет вещей", "A system of connected physical devices that exchange data over a network without human interaction."],
  [14, "human-level artificial intelligence", "искусственный интеллект человеческого уровня", "AI that can perform intellectual tasks at the level of a human being."],
  [14, "Turing Test", "тест Тьюринга", "A test of machine intelligence in which a judge tries to distinguish a machine from a human."],
  [15, "hardware engineer", "инженер по аппаратному обеспечению", "An IT specialist who designs, builds and tests computer hardware."],
  [15, "software engineer", "программист", "An IT specialist who designs, develops and tests software."],
  [15, "system administrator", "системный администратор", "A specialist who maintains computer systems, servers and networks."],
  [15, "data scientist", "специалист по данным", "A specialist who analyses large data sets and builds models to extract useful information."],
  [15, "IT security specialist", "специалист по информационной безопасности", "A specialist who protects systems and data from cyber threats."],
  [15, "database administrator", "администратор баз данных", "A specialist who manages and maintains databases."],
  [15, "network engineer", "сетевой инженер", "A specialist who designs, installs and maintains computer networks."],
  [15, "full-stack developer", "full-stack разработчик", "A developer who works on both front-end and back-end parts of web applications."],
  [15, "IT director", "ИТ-директор", "A manager who plans and controls the IT strategy and infrastructure of an organization."]
];

const abbreviations = [
  [1, "AI", "artificial intelligence", "искусственный интеллект"],
  [1, "VLSI", "very large scale integration", "сверхбольшая интегральная схема", ["very large scale integrated circuits"]],
  [2, "USB", "universal serial bus", "универсальная последовательная шина"],
  [3, "CPU", "central processing unit", "центральный процессор"],
  [3, "ALU", "arithmetic logic unit", "арифметико-логическое устройство"],
  [4, "RAM", "random access memory", "оперативная память"],
  [4, "ROM", "read-only memory", "постоянное запоминающее устройство"],
  [4, "BIOS", "basic input/output system", "базовая система ввода-вывода"],
  [4, "SRAM", "static random access memory", "статическая оперативная память"],
  [4, "DRAM", "dynamic random access memory", "динамическая оперативная память"],
  [4, "PROM", "programmable read-only memory", "программируемое постоянное запоминающее устройство"],
  [4, "EPROM", "erasable programmable read-only memory", "стираемое программируемое постоянное запоминающее устройство"],
  [4, "EEPROM", "electrically erasable programmable read-only memory", "электрически стираемое программируемое постоянное запоминающее устройство"],
  [5, "HDD", "hard disk drive", "жёсткий диск"],
  [5, "SSD", "solid-state drive", "твердотельный накопитель"],
  [5, "CD", "compact disc", "компакт-диск"],
  [5, "DVD", "digital versatile disc", "цифровой универсальный диск", ["digital video disc"]],
  [7, "LAN", "local area network", "локальная сеть"],
  [7, "MAN", "metropolitan area network", "городская сеть"],
  [7, "WAN", "wide area network", "глобальная сеть"],
  [7, "WLAN", "wireless local area network", "беспроводная локальная сеть"],
  [7, "OSI", "open systems interconnection", "модель взаимодействия открытых систем"],
  [7, "TCP", "transmission control protocol", "протокол управления передачей"],
  [7, "IP", "internet protocol", "межсетевой протокол"],
  [7, "UDP", "user datagram protocol", "протокол пользовательских дейтаграмм"],
  [8, "DSL", "digital subscriber line", "цифровая абонентская линия"],
  [8, "ADSL", "asymmetric digital subscriber line", "асимметричная цифровая абонентская линия"],
  [8, "ISP", "internet service provider", "интернет-провайдер"],
  [9, "SEO", "search engine optimization", "поисковая оптимизация"],
  [10, "OOP", "object-oriented programming", "объектно-ориентированное программирование"],
  [11, "HTML", "hypertext markup language", "язык разметки гипертекста"],
  [11, "CSS", "cascading style sheets", "каскадные таблицы стилей"],
  [11, "URL", "uniform resource locator", "универсальный указатель ресурса"],
  [11, "FTP", "file transfer protocol", "протокол передачи файлов"],
  [12, "DDoS", "distributed denial of service", "распределённая атака на отказ в обслуживании"],
  [13, "MFA", "multi-factor authentication", "многофакторная аутентификация"],
  [13, "SSL", "secure sockets layer", "протокол защищённых соединений"],
  [14, "ANN", "artificial neural network", "искусственная нейронная сеть"],
  [14, "CNN", "convolutional neural network", "свёрточная нейронная сеть"],
  [14, "RNN", "recurrent neural network", "рекуррентная нейронная сеть"],
  [14, "IoT", "internet of things", "интернет вещей"],
  [14, "HLAI", "human-level artificial intelligence", "искусственный интеллект человеческого уровня", ["human-like artificial intelligence"]]
];

const texts = [
  {
    id: 1, unit_id: 3, title: "Multicore processors",
    en: `A multicore processor is a single computing component with two or more independent actual processors called cores. The heart of each processor is the execution engine, also known as the core. The core is designed to process instructions and data in accordance with the instructions of programs in the computer memory. Over the years designers have found that every new processor design has its limits. A multicore processor is an integrated circuit with two or more cores connected to improve performance and reduce power consumption. Such processors also make it possible to process several tasks at the same time more efficiently, for example in parallel processing and multithreading. Multicore processors work on any modern hardware platform. Almost all modern PCs and laptops have some model of a multicore processor. However, the true power and advantage of these processors depend on programs designed to emphasize parallelism and increase clock speed.`,
    ru: `Многоядерный процессор — это единый вычислительный компонент с двумя или более независимыми реальными процессорами, которые называются ядрами. Сердцем каждого процессора является исполнительный механизм, также известный как ядро. Ядро предназначено для обработки инструкций и данных в соответствии с указаниями программ в памяти компьютера. С годами разработчики обнаружили, что у каждого нового проекта процессора есть свои пределы. Многоядерный процессор — это интегральная схема с двумя или более ядрами, соединёнными для повышения производительности и снижения энергопотребления. Такие процессоры также позволяют более эффективно обрабатывать несколько задач одновременно, например при параллельной обработке и многопоточности. Многоядерные процессоры работают на любой современной аппаратной платформе. Почти все современные ПК и ноутбуки имеют ту или иную модель многоядерного процессора. Однако истинная мощность и преимущество этих процессоров зависят от программ, созданных так, чтобы подчёркивать параллелизм и повышать тактовую частоту.`
  },
  {
    id: 2, unit_id: 7, title: "The OSI model",
    en: `OSI (Open System Interconnection), adopted in 1984 by the International Organization for Standardization, is a reference model that gives an idea of how data is transmitted over networks. It is used by IT networking professionals as a guideline to describe how traffic moves from one part of the network to another and for troubleshooting if a network problem occurs. The OSI model consists of seven layers, and at each layer there is a set of protocols, which may be very different depending on the kind of traffic going over a network.`,
    ru: `Модель OSI (взаимодействие открытых систем), принятая в 1984 году Международной организацией по стандартизации, — это эталонная модель, которая даёт представление о том, как данные передаются по сетям. Специалисты по сетям используют её как руководство, чтобы описать, как трафик перемещается из одной части сети в другую, а также для поиска неисправностей при возникновении сетевой проблемы. Модель OSI состоит из семи уровней, и на каждом уровне есть набор протоколов, которые могут сильно различаться в зависимости от типа трафика, передаваемого по сети.`
  },
  {
    id: 3, unit_id: 9, title: "How search engines work",
    en: `A search engine is a software program that provides information according to the user query. It finds various websites or web pages that are available on the Internet and gives related results according to the search. Today there are many different search engines available on the Internet, each with its own abilities and features. Search engines can be classified into the following three categories: crawler-based search engines, human-powered directories and meta-search engines. Crawler-based search engines such as Google and Yahoo compile their listings automatically. There are three basic steps that every crawler-based search engine follows before displaying search results: crawling, indexing and ranking.`,
    ru: `Поисковая система — это программное обеспечение, которое предоставляет информацию в соответствии с запросом пользователя. Она находит различные веб-сайты или веб-страницы, доступные в Интернете, и выдаёт связанные с запросом результаты. Сегодня в Интернете доступно множество различных поисковых систем, каждая со своими возможностями и особенностями. Поисковые системы можно разделить на три категории: автоматические поисковые системы на основе поисковых роботов, веб-каталоги, создаваемые людьми, и метапоисковые системы. Автоматические поисковые системы, такие как Google и Yahoo, составляют свои списки автоматически. Существуют три основных шага, которые выполняет каждая автоматическая поисковая система перед показом результатов поиска: сканирование, индексирование и ранжирование.`
  },
  {
    id: 4, unit_id: 12, title: "The parts of a virus",
    en: `Any virus has four main parts: a misdirection routine that enables it to hide itself; a reproduction routine that allows it to copy itself to other programs; a trigger that causes the payload to be activated at a particular time or when a particular event takes place; and a payload that may be a fairly harmless joke or may be very destructive. A program that has a payload but does not have a reproduction routine is known as a Trojan.`,
    ru: `У любого вируса есть четыре основные части: процедура дезориентации, которая позволяет ему скрываться; процедура размножения, которая позволяет ему копировать себя в другие программы; триггер, который вызывает активацию полезной нагрузки в определённое время или при определённом событии; и полезная нагрузка, которая может быть довольно безобидной шуткой, а может быть очень разрушительной. Программа, у которой есть полезная нагрузка, но нет процедуры размножения, называется троянским конём.`
  },
  {
    id: 5, unit_id: 14, title: "Artificial neural networks",
    en: `Artificial neural networks (ANN) are a type of Artificial Intelligence (AI) designed to mimic how the human brain processes information. ANN consists of interconnected nodes, or neurons, that process information similarly to the human brain. The artificial neurons receive input and then use the information to create the output or data. In between the input units and output units are one or more layers of hidden units, which, together, form the majority of the artificial brain. Most neural networks are fully connected, which means each unit in one layer is connected to every unit in another layer. The connections between one unit and another are represented by a number called a weight, which can be either positive or negative.`,
    ru: `Искусственные нейронные сети (ИНС) — это тип искусственного интеллекта (ИИ), предназначенный для имитации того, как человеческий мозг обрабатывает информацию. ИНС состоит из взаимосвязанных узлов, или нейронов, которые обрабатывают информацию подобно человеческому мозгу. Искусственные нейроны получают входные данные и затем используют информацию для создания выходных данных. Между входными и выходными элементами находятся один или несколько слоёв скрытых элементов, которые вместе образуют большую часть искусственного мозга. Большинство нейронных сетей являются полносвязными, что означает, что каждый элемент одного слоя соединён с каждым элементом другого слоя. Связи между одним элементом и другим представлены числом, называемым весом, который может быть положительным или отрицательным.`
  }
];

const bankSlug = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const out = {
  meta: {
    title: "IT English Lab — экзаменационные материалы",
    source: "Course study materials",
    level: "B1",
    exam1_units: [1, 8],
    exam2_terms: 20,
    exam2_questions: 10,
    bank_version: 2,
    bank_tags: ["unit", "vocab", "term", "abbr", "question", "reading", "text", "audio"]
  },
  questions: questions.map((q) => ({
    id: q.id,
    unit_id: q.unit_id,
    question: q.q,
    answer: q.a,
    ...sourceFor(q.unit_id, "text"),
    tags: ["unit-" + q.unit_id, "exam", "question"],
    ...(q.note ? { note: q.note } : {}),
  })),
  terms: terms.map(([unit_id, en, ru, definition]) => ({
    unit_id,
    en,
    ru,
    definition,
    ...sourceFor(unit_id, "vocab"),
    id: "u" + String(unit_id).padStart(2, "0") + "-" + bankSlug(en),
    tags: ["unit-" + unit_id, "vocab", "term"],
  })),
  abbreviations: abbreviations.map(([unit_id, abbr, full, ru, accept]) => ({
    unit_id,
    abbr,
    full,
    ru,
    ...sourceFor(unit_id, "vocab"),
    ...(accept ? { accept } : {}),
    id: "u" + String(unit_id).padStart(2, "0") + "-" + bankSlug(abbr),
    tags: ["unit-" + unit_id, "vocab", "abbr"],
  })),
  texts: texts.map((text) => ({
    ...text,
    ...textSource(text),
    tags: ["unit-" + text.unit_id, "reading", "text", "audio"],
  })),
};

const file = path.join(__dirname, "..", "data", "exams.json");
fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`written ${file}`);
console.log(`questions=${questions.length} terms=${terms.length} abbreviations=${abbreviations.length} texts=${texts.length}`);
