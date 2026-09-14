/**
 * CSS files are handled by the Metro/NativeWind pipeline, not by TypeScript.
 * These declarations just tell tsc the imports are legal.
 */

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module '*.css' {}
