import inquirer from "inquirer";
import fs from "fs-extra";
import chalk from "chalk";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load OpenAI API Key from ENV
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.log(chalk.red("⚠️ Missing OpenAI API Key. Set OPENAI_API_KEY in env."));
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: apiKey,
});

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

async function selectAppType() {
  const { appType } = await inquirer.prompt([
    {
      type: "list",
      name: "appType",
      message: "Which type of app do you want to generate?",
      choices: [
        { name: "🌐 Web App", value: "web-app" },
        { name: "💻 Terminal App (CLI)", value: "term-app" },
      ]
    }
  ]);
  return appType;
}

async function loadMCP(appType) {
  try {
    const mcpPath = `./mcp/${appType}.js`;
    const { default: mcp } = await import(mcpPath, { assert: { type: "javascript" } });
    return mcp;
  } catch (error) {
    console.error(chalk.red(`❌ Failed to load MCP for '${appType}':`), error);
    process.exit(1);
  }
}

function extractJsonFromResponse(text) {
  // Remove everything before and after the first JSON block
  const match = text.match(/```json([\s\S]*?)```/);
  if (match) {
    return match[1].trim();
  }

  // Fallback: try extracting first outermost {...}
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    return text.slice(jsonStart, jsonEnd + 1).trim();
  }

  throw new Error("No JSON found in the AI response.");
}


async function generateCodeWithOpenAI(projectIdea, mcp, model = "gpt-4") {
  console.log(chalk.blue("\n💡 Generating Code... Please wait...\n"));

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: mcp },
        { role: "user", content: projectIdea },
      ],
    });

    const raw = response.choices[0].message.content.trim();
    let parsed;

    try {
      const json = extractJsonFromResponse(raw);
      parsed = JSON.parse(json);

      if (!parsed.codeFiles || typeof parsed.codeFiles !== 'object') {
        throw new Error("Missing or invalid 'codeFiles' in parsed response.");
      }

      return parsed;

    } catch (err) {
      console.error(chalk.red("❌ Failed to parse AI response as valid JSON."));
      console.log(chalk.gray("\n📦 Raw AI Response:\n" + raw));
      process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red("❌ OpenAI API error:"), error.message || error);
    process.exit(1);
  }
}

async function saveFiles(output, projectName) {
  // const baseDir = path.join(__dirname, projectName);
  const baseDir = path.join(__dirname, 'output', projectName);

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
  console.log(chalk.cyan("\n🚀 AI Code Generator CLI\n"));

  const appType = await selectAppType();
  const mcp = await loadMCP(appType);

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

  const output = await generateCodeWithOpenAI(confirmedPrompt, mcp);
  await saveFiles(output, projectName);
}

main();
