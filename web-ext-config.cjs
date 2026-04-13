const { readFileSync } = require("node:fs")
const { resolve } = require("node:path")

const ignoreFiles = readFileSync(resolve(__dirname, ".extensionignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

module.exports = { ignoreFiles }
