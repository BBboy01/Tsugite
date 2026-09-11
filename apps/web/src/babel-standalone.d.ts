declare module "@babel/standalone" {
  type TransformResult = { code?: string };

  const Babel: {
    transform: (
      source: string,
      options: {
        presets?: string[];
        sourceType?: "script";
        parserOpts?: { plugins: string[] };
      },
    ) => TransformResult;
  };

  export default Babel;
}
