const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "units.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const findText = (unitId, letter) => {
  const unit = data.units.find((u) => u.id === unitId);
  const text = unit && unit.texts.find((t) => t.letter === letter);
  if (!text) throw new Error(`Text ${unitId}:${letter} not found`);
  return text;
};

const replaceInText = (unitId, letter, pairs) => {
  const text = findText(unitId, letter);
  text.paragraphs = text.paragraphs.map((paragraph) => {
    let result = paragraph;
    for (const [from, to] of pairs) result = result.split(from).join(to);
    return result;
  });
};

const setParagraphs = (unitId, letter, paragraphs) => {
  const text = findText(unitId, letter);
  text.paragraphs = paragraphs;
};

replaceInText(3, "A", [
  ["etc. -+ to execute", "etc. — to execute"],
  [
    "The power and performance of a computer is partly determined by the speed of its processor.",
    "The power and performance of a computer are partly determined by the speed of its processor."
  ],
  ["ROM (read only memory)", "ROM (read-only memory)"],
  ["flash drives (USB stick)", "flash drives (USB sticks)"],
  ["expansions slots", "expansion slots"]
]);

setParagraphs(3, "B", [
  "A multicore processor is a single computing component with two or more independent actual processing units, called cores. The heart of every processor is an execution engine, also known as a core. The core is designed to process instructions and data according to the direction of software programs in the computer's memory. Over the years, designers found that every new processor design had limits. A multicore processor is an integrated circuit that has two or more processor cores attached for enhanced performance and reduced power consumption. These processors also enable more efficient simultaneous processing of multiple tasks, such as with parallel processing and multithreading.",
  "Multicore processors work on any modern computer hardware platform. Virtually all PCs and laptops today build in some multicore processor model. However, the true power and benefit of these processors depend on software applications designed to emphasize parallelism and increase clock speeds."
]);

const u4 = findText(4, "A").paragraphs;
u4[2] =
  "A read-only memory chip is an integrated circuit which houses the instructions required to start the work of a computer. BIOS software is stored on a non-volatile ROM chip. The data in ROM can only be read by the CPU; it cannot be modified. The CPU cannot directly access ROM: the data must first be transferred to RAM, and then the CPU can access it from RAM. ROM is often used to store the BIOS program on a computer motherboard. ROM was used as a storage medium in Nintendo, Game Boy, and Sega Genesis game cartridges. ROM chips store several megabytes (MB) of data, usually 4 to 8 MB per chip. They can vary in size from less than an inch to multiple inches in length and width, depending on their use. ROM can be classified into MROM, PROM, EPROM and EEPROM:";
u4[3] =
  "RAM stores the data which is currently being processed by the CPU. The data that is easily modifiable is generally stored in RAM. RAM is of two types: Static Random Access Memory (SRAM) and Dynamic Random Access Memory (DRAM). SRAM stores data in transistors and requires a constant power flow. Because of the continuous power, SRAM doesn’t need to be refreshed to remember the data being stored. SRAM is called static as no change or action (i.e. refreshing) is needed to keep the data intact. It is used in cache memories.";
u4[4] = "Dynamic random access memory (DRAM)";
u4[5] =
  "DRAM is relatively less expensive RAM due to the use of one transistor and one capacitor in each cell. Data is stored in capacitors. Capacitors that store data in DRAM gradually discharge energy; no energy means the data has been lost. So, a periodic refresh of power is required in order for it to function. It is used to implement main memory. This memory is slower than SRAM.";
u4[7] =
  "To make this arrangement effective, the cache needs to be much faster than the main memory. This approach is more economical than the use of fast memory devices to implement the entire main memory. Cache is a storage device found on the CPU chip itself. It carries copies of original data that has been accessed recently and therefore increases the speed at which data is accessed. When the processor needs to read or write a location in the main memory, it first checks for a corresponding entry in the cache. If the processor finds that the memory location is in the cache, a cache hit has occurred and data is read from the cache.";

// Insert the ROM subtype descriptions as separate paragraphs after the
// classification sentence. They were originally separated by private-use
// bullet glyphs from the DOCX extractor.
const romTypes = [
  "MROM (Masked read-only memory) is as old as semiconductor technology. This type of ROM data is physically encoded in the circuit and can only be programmed during fabrication.",
  "PROM (Programmable ROM) can be modified only once by the user.",
  "EPROM (Erasable and Programmable ROM) can be erased using ultraviolet rays and then reprogrammed.",
  "EEPROM (Electrically Erasable and Programmable ROM) can be erased electrically and reprogrammed about ten thousand times.",
  "FLASH ROM has modern designs with very high endurance; flash memory can be erased and rewritten more quickly than conventional EEPROM (exceeding 1,000,000 cycles)."
];
u4.splice(3, 0, ...romTypes);

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("Fixed texts in", dataPath);
