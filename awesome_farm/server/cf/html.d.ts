// wrangler loads .html files as text (the Text rule in wrangler.toml)
declare module '*.html' {
    const text: string;
    export default text;
}
