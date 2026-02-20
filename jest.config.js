/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^@domain/(.*)$": "<rootDir>/src/domain/$1",
    "^@db$": "<rootDir>/src/db",
    "^@db/(.*)$": "<rootDir>/src/db/$1",
    "^@i18n$": "<rootDir>/src/i18n",
    "^@i18n/(.*)$": "<rootDir>/src/i18n/$1",
  },
};
