import readline from "node:readline";

export function promptText(message: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${message} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

