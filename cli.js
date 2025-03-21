import inquirer from "inquirer";
import fs from "fs-extra";
import chalk from "chalk";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import 'dotenv/config';
import mcp from "./mcp.js";


// Load OpenAI API Key from ENV
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.log(chalk.red("⚠️ Missing OpenAI API Key. Set OPENAI_API_KEY in env."));
  process.exit(1);
}

const openai = new OpenAI({
    apiKey: apiKey,
});
  
const __dirname = path.dirname(fileURLToPath(import.meta.url));


async function getInputWithEditor(defaultText = "") {
  const { projectIdea } = await inquirer.prompt([
    {
      type: "editor",
      name: "projectIdea",
      message: "Describe your app idea (multi-line):",
      default: defaultText
    }
  ]);
  return projectIdea.trim();
}

async function previewPrompt(projectIdea) {
  while (true) {
    console.log(chalk.cyan("\n📄 Here's what you wrote:\n"));
    console.log(chalk.gray(projectIdea));

    const { confirmInput } = await inquirer.prompt([
      {
        type: "list",
        name: "confirmInput",
        message: "✅ Proceed with this input?",
        choices: [
          { name: "Yes, generate the code", value: "yes" },
          { name: "No, edit again", value: "edit" },
          { name: "Cancel", value: "cancel" },
        ],
      },
    ]);

    if (confirmInput === "yes") return projectIdea;
    if (confirmInput === "cancel") {
      console.log(chalk.red("❌ Cancelled."));
      process.exit(0);
    }
    projectIdea = await getInputWithEditor(projectIdea);
  }
}


// Function to interact with AI
export async function generateCodeWithOpenAI(projectIdea, model = "o3-mini") {
    console.log(chalk.blue("\n💡 Generating Code... Please wait...\n"));

    try {
        const response = await openai.chat.completions.create({
        model: model,
        messages: [
            { role: "system", content: mcp },
            { role: "user", content: projectIdea },
        ],
        });

        const aiResponse = response.choices[0].message.content.trim();
        return JSON.parse(aiResponse); // Convert AI output to JSON
    } catch (error) {
        console.error(chalk.red("❌ Error generating code"), error);
}
  }
  
async function generateCode(projectIdea) {
  console.log(chalk.blue("\n💡 Generating code locally with Ollama...\n"));
  const res = await ollama.chat({
    model: "codellama", //"mistral",
    messages: [
      { role: "system", content: mcp },
      { role: "user", content: projectIdea },
    ],
  });
  const json = JSON.parse(res.message.content.trim());
  return json;
}

async function saveFiles(output, projectName) {
  const baseDir = path.join(__dirname, projectName);
  console.log(chalk.green(`\n📁 Writing files to ./${projectName}/\n`));

  for (const [filePath, content] of Object.entries(output.codeFiles)) {
    const fullPath = path.join(baseDir, filePath);
    await fs.outputFile(fullPath, content);
    console.log(chalk.yellow(`✅ ${filePath}`));
  }

  console.log(chalk.green(`\n🎉 Project '${projectName}' created successfully!\n`));
}

async function main() {
  console.clear();
  console.log(chalk.cyan("\n🚀 AI Code Generator CLI (Local LLM Edition)\n"));

  const { projectName } = await inquirer.prompt([
    {
      type: "input",
      name: "projectName",
      message: "Enter a name for your project folder:",
      default: "my-app"
    }
  ]);

  const rawInput = await getInputWithEditor();
  const confirmedPrompt = await previewPrompt(rawInput);

  const output = await generateCodeWithOpenAI(confirmedPrompt);
  await saveFiles(output, projectName);
}

main();
