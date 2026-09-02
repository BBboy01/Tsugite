declare module "@babel/standalone" {
  type TransformResult = { code?: string };

  const Babel: {
    transform: (
      source: string,
      options: { presets: string[]; sourceType: "script" },
    ) => TransformResult;
  };

  export default Babel;
}
