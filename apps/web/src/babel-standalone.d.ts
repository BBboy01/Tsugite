declare module "@babel/standalone" {
  type TransformResult = { code?: string };

  const Babel: {
    transform: (
      source: string,
      options: {
        code?: boolean;
        presets?: string[];
        sourceType?: "script";
        parserOpts?: { plugins: string[] };
      },
    ) => TransformResult;
  };

  export default Babel;
}
