const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "units.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const replacements = new Map([
  ["How computers have developed over time?", "How have computers developed over time?"],
  ["What are the principle differences between a supercomputer and a mainframe?", "What are the principal differences between a supercomputer and a mainframe?"],
  ["Why is SSD being replaced by HDD in modern computers?", "Why is HDD being replaced by SSD in modern computers?"],
  ["What devices refer to secondary storage media?", "Which devices are secondary storage media?"],
  ["What is OSI model?", "What is the OSI model?"],
  ["What networking devices are mentioned in the text? Describe them into details.", "What networking devices are mentioned in the text? Describe them in detail."],
  ["What types of the Internet connections do you know?", "What types of Internet connections do you know?"],
  ["What is a data encryption?", "What is data encryption?"],
  ["What is the biometric authentication?", "What is biometric authentication?"],
  ["In what way is an artificial neural network similar to biological brain?", "In what way is an artificial neural network similar to a biological brain?"],
  ["Why is Information technology considered as a broad field?", "Why is information technology considered a broad field?"],
  ["How does a cooperative operating system differ from a preemptive operating systems?", "How does a cooperative operating system differ from a preemptive operating system?"],
  ["How do we call the process of identifying the words and expressions for the page description?", "What do we call the process of identifying the words and expressions for the page description?"],
  ["How do we call the commands HTML consists of?", "What do we call the commands HTML consists of?"],
  ["What is a web design? Why do we need websites?", "What is web design? Why do we need websites?"],
  ["Search engines are generally work on three parts that are crawling, indexing, and identifying.", "Search engines generally work in three parts: crawling, indexing, and identifying."],
  ["Internet usage has increased greatly in the recent years with the easy to use search engines like Google, Bing and Yahoo!", "Internet usage has increased greatly in recent years with easy-to-use search engines like Google, Bing and Yahoo!"],
  ["Testers have to monitor the system daily and respond to immediately to any security and usability concerns.", "Testers have to monitor the system daily and respond immediately to any security and usability concerns."],
  ["Database scientists keep the database up to date, ensure that the database is correctly backed up and can recovered in case of data loss.", "Database administrators keep the database up to date, ensure that the database is correctly backed up and can be recovered in case of data loss."],
  ["Data scientists make sure that software and hardware are maintained allowing for vital information to be easily stored, accessed and utilized.", "Data scientists make sure that software and hardware are maintained, allowing vital information to be easily stored, accessed and utilized."],
  ["A server is a kind of a normal workstation.", "A server is a kind of normal workstation."],
  ["Magnetized tiny area of the plate denotes a binary one.", "A magnetized tiny area of the plate denotes a binary one."],
  ["Optical storage devices offer lesser capacity than magnetic ones.", "Optical storage devices offer less capacity than magnetic ones."],
  ["CLI uses WIMP environment to run different programs.", "CLI uses a WIMP environment to run different programs."],
  ["A tree network is a combination of a ring and a star topologies.", "A tree network is a combination of ring and star topologies."],
  ["Human powered directories depend on crawler-based activities for listings.", "Human-powered directories depend on crawler-based activities for listings."],
  ["Локальные сети охватывают небольшую географическую область, например офис, дом, здание или группу зданий.", "Локальные сети охватывают небольшую географическую область, например, офис, дом, здание или группу зданий."],
  ["Некоторые антивирусные программы запрашивают разрешение, перед тем как удалить вредоносный код.", "Некоторые антивирусные программы запрашивают разрешение перед тем, как удалить вредоносный код."],
  ["Пароли, состоящие только из цифр, не являются достаточно надежными.", "Пароли, состоящие только из цифр, не являются достаточно надёжными."],
  ["Скачивая бесплатное или условно бесплатное программное обеспечение, убедитесь в том, что вы взяли его у надежного поставщика ПО.", "Скачивая бесплатное или условно бесплатное программное обеспечение, убедитесь в том, что вы взяли его у надёжного поставщика ПО."],
  ["Надежное ПО является одним из самых эффективных способов защиты от киберугроз.", "Надёжное ПО является одним из самых эффективных способов защиты от киберугроз."]
]);

function walk(value) {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = walk(value[key]);
  }
  return value;
}

walk(data);
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("Polished", dataPath);
