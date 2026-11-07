import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import glsl from 'react-syntax-highlighter/dist/esm/languages/hljs/glsl';
import lua from 'react-syntax-highlighter/dist/esm/languages/hljs/lua';

SyntaxHighlighter.registerLanguage('glsl', glsl);
SyntaxHighlighter.registerLanguage('lua', lua);

export { SyntaxHighlighter as FeatherSyntaxHighlighter };
