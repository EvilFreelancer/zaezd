// Executable Gherkin specs. Step definitions are TypeScript, loaded by Node's
// native type stripping - no transpiler in the loop.
export default {
  paths: ['features/**/*.feature'],
  import: ['features/support/**/*.ts', 'features/steps/**/*.ts'],
  format: ['summary', 'progress'],
  formatOptions: { snippetInterface: 'async-await' },
  strict: true,
  publishQuiet: true,
};
