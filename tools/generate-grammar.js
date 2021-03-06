var Generator = require('jison').Generator;

var grammar = {
    'lex': {
        'rules': []
    },
    'operators': [],
    'bnf': {}
};

var regex_escape= function(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};

(
    ', ? = += -= *= /= %= <<= >>= &= ^= |= ' +
    '|| && | ^ & == != < <= > >= << >> + - ' +
    '* / % ++ -- ! ~ : ( ) [ ] { } . ' +
    'break call continue do else for if return var void while'
).split(' ').forEach(function (v) {
    // Create lexer rules for each token.
    grammar.lex.rules.push([
        regex_escape(v), 'return ' + JSON.stringify(v) + ';'
    ]);
});

// Create lexer rules for literals, whitespace and comments.
grammar.lex.rules.push(['\\s+', '/* skip whitespace */']);
grammar.lex.rules.push(['\\/\\*(.|\\n|\\r)*?\\*\\/', '/* multi-line comment */']);
grammar.lex.rules.push(['\\/\\/.*', '/* line comment */']);
grammar.lex.rules.push(['"(\\\\.|[^\\\\"])*"', 'return "STRING";']);
grammar.lex.rules.push(["'(\\\\.|[^\\\\'])*'", 'return "STRING";']);
grammar.lex.rules.push(['[0-9]+(\\.[0-9]*)?([eE][0-9]+)?\\b', 'return "NUMBER";']);
grammar.lex.rules.push(['\\.[0-9]+([eE][0-9]+)?\\b', 'return "NUMBER";']);
grammar.lex.rules.push(['0x[0-9A-Fa-f]+\\b', 'return "NUMBER";']);
grammar.lex.rules.push(['[A-Za-z_][0-9A-Za-z_]*', 'return "IDENTIFIER";']);
grammar.lex.rules.push(['$', 'return "EOF";']);

// Begin grammar.
grammar.start = 'start';
grammar.bnf.start = [
    ['statements EOF', 'return $1;']
];
grammar.bnf.statements = [
    ['', '$$ = ["statements", []];'],
    ['statements statement', '$$ = $1; $$[1].push($2);']
];
// Credit for the closed_statement/open_statement solution to the
// dangling else problem goes to Parsifal Software.
// http://www.parsifalsoft.com/ifelse.html
grammar.bnf.statement = [
    ['closed_statement', '$$ = $1;'],
    ['open_statement', '$$ = $1;']
];
grammar.bnf.if_clause = [
    ['"if" expr_1', '$$ = $2;']
];
grammar.bnf.loop_header = [
    ['"while" expr_1', '$$ = ["while", [$2]];'],
    // TODO: var in for loop
    ['"for" "(" expression ";" expression ";" expression ")"', '$$ = ["for", [$3, $5, $7]];']
];
grammar.bnf.open_statement = [
    ['if_clause statement', '$$ = ["if", [$1, $2]];'],
    ['if_clause closed_statement "else" open_statement', '$$ = ["if_else", [$1, $2, $4]];'],
    ['loop_header open_statement', '$$ = $1; $$[1].push($2);']
];
grammar.bnf.closed_statement = [
    // TODO: var
    ['"{" statements "}"', '$$ = $2;'],
    ['expression ";"', '$$ = $1;'],
    ['"return" ";"', '$$ = ["return", ["void"]];'],
    ['"return" expression ";"', '$$ = ["return", $2];'],
    ['loop_header closed_statement', '$$ = $1; $$[1].push($2);']
];

grammar.bnf.identifier = [['IDENTIFIER', '$$ = ["identifier", yytext];']];

var binary_expr = function (level, operators, assoc) {
    assoc = assoc || 'left';
    if (['left', 'right'].indexOf(assoc) === -1)
        throw new Error('binary_expr: assoc must be "left" or "right"');
    var left = assoc === 'left' ? level : level - 1;
    var right = assoc === 'left' ? level - 1 : level;
    grammar.bnf['expr_' + level] = [
        ['expr_' + (level - 1), '$$ = $1;']
    ];
    operators.split(' ').forEach(function (v) {
        grammar.bnf['expr_' + level].push([
            'expr_' + left + ' "' + v + '" expr_' + right,
            '$$ = ["binary", ["' + v + '", $1, $3]]'
        ]);
    });
};

grammar.bnf.expr_1 = [
    ['STRING', '$$ = ["string", yytext];'],
    ['NUMBER', '$$ = ["number", yytext];'],
    ['"void"', '$$ = ["void"];'],
    ['identifier', '$$ = $1;'],
    ['"{" ":" ":" statements "}"', '$$ = ["function", [["arguments", []], $4]];'],
    ['"{" ":" arguments ":" statements "}"', '$$ = ["function", [$3, $5]];'],
    ['"(" expression ")"', '$$ = $2;']
];
grammar.bnf.expr_2 = [ // Prefix operators.
    ['expr_1', '$$ = $1;']
];
'++ -- + - ! ~'.split(' ').forEach(function (v) {
    grammar.bnf.expr_2.push([
        '"' + v + '" expr_2', '$$ = ["prefix", [$1, $2]];'
    ]);
});
grammar.bnf.expr_3 = [ // Suffix operators.
    ['expr_2', '$$ = $1;'],
    ['expr_3 expr_1', '$$ = ["call", [$1, $2]];'],
    ['"call" expr_1 ', '$$ = ["call", [$2]];'],
    ['expr_3 "[" expression "]"', '$$ = ["index", [$1, $3]];'],
    ['expr_3 "." identifier', '$$ = ["member", [$1, $3]];']
];
'++ --'.split(' ').forEach(function (v) {
    grammar.bnf.expr_3.push([
        'expr_3 "' + v + '"', '$$ = ["suffix", [$2, $1]];'
    ]);
});
binary_expr(4, '* / %');
binary_expr(5, '+ -');
binary_expr(6, '<< >>');
binary_expr(7, '< <= > >=');
binary_expr(8, '== !=');
binary_expr(9, '&');
binary_expr(10, '^');
binary_expr(11, '|');
binary_expr(12, '&&');
binary_expr(13, '||');
binary_expr(14, '= += -= *= /= %= <<= >>= &= ^= |=', 'right');
grammar.bnf.expr_14.push([
    'expr_13 "?" expr_14 ":" expr_14', '$$ = ["ternary", [$1, $3, $5]];'
]);
binary_expr(15, ',');
grammar.bnf.expression = [
    ['expr_15', '$$ = $1;']
];
grammar.bnf.arguments = [
    ['identifier', '$$ = ["arguments", [$1]];'],
    ['arguments "," identifier', '$$ = $1; $$[1].push($3);']
];

exports.output = function () {
    return new Generator(grammar).generate();
};
