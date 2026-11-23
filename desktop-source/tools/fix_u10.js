const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "units.json");
const parsedPath = path.join(process.env.TEMP, "itelab-parsed-tasks.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf8"));

const unit = data.units.find((u) => u.id === 10);
const tasks = unit.tasks;
const parsedTasks = parsed.unit_10.tasks;

const definitions = tasks[3].body.slice();
const fillIn = tasks[4].body.slice();
const translation = tasks[5].body.slice();

tasks[1].body = tasks[1].body.filter((line) => line.trim().toLowerCase() !== "them");

tasks[3].num = 4;
tasks[3].title = parsedTasks[3].title;
tasks[3].body = parsedTasks[3].body;

tasks[4].num = 5;
tasks[4].title = parsedTasks[4].title;
tasks[4].body = definitions;

tasks[5].num = 6;
tasks[5].title = parsedTasks[5].title;
tasks[5].body = fillIn;

tasks[6].num = 7;
tasks[6].title = parsedTasks[6].title;
tasks[6].body = translation;

unit.translation_sentences = translation.slice();

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("Fixed unit 10 task ordering");
