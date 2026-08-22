// Ambient declarations for Bun text imports.
//
// `import X from './y' with { type: 'text' }` makes the bundler embed the file
// contents in the compiled binary. TypeScript has no built-in knowledge of the
// text import attribute, so the module shapes are declared here. Without the
// embed, `bun build --compile` produces a binary whose `/theme.css` route
// resolves to a source-tree path that does not exist at runtime.

declare module '*.css' {
  const contents: string;
  export default contents;
}

declare module '*/animations.js' {
  const contents: string;
  export default contents;
}
