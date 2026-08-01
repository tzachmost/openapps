export type ReferenceGroup = {
	title: string;
	rows: Array<{ token: string; meaning: string }>;
};

export const REFERENCE: ReferenceGroup[] = [
	{
		title: 'Character classes',
		rows: [
			{ token: '.', meaning: 'Any character except a line break (unless the s flag is on)' },
			{ token: '\\d  \\D', meaning: 'Digit / not a digit' },
			{ token: '\\w  \\W', meaning: 'Word character (letter, digit, _) / not one' },
			{ token: '\\s  \\S', meaning: 'Whitespace / not whitespace' },
			{ token: '[abc]', meaning: 'Any one of a, b, or c' },
			{ token: '[^abc]', meaning: 'Any character except a, b, or c' },
			{ token: '[a-z]', meaning: 'Any character in the range a to z' }
		]
	},
	{
		title: 'Anchors & boundaries',
		rows: [
			{ token: '^', meaning: 'Start of the string (or line, with the m flag)' },
			{ token: '$', meaning: 'End of the string (or line, with the m flag)' },
			{ token: '\\b  \\B', meaning: 'Word boundary / not a word boundary' }
		]
	},
	{
		title: 'Quantifiers',
		rows: [
			{ token: 'a*', meaning: 'Zero or more of a' },
			{ token: 'a+', meaning: 'One or more of a' },
			{ token: 'a?', meaning: 'Zero or one of a' },
			{ token: 'a{2,4}', meaning: 'Between 2 and 4 of a' },
			{ token: 'a+?', meaning: 'One or more of a, as few as possible (lazy)' }
		]
	},
	{
		title: 'Groups & alternation',
		rows: [
			{ token: '(abc)', meaning: 'Capturing group' },
			{ token: '(?<name>abc)', meaning: 'Named capturing group — read back as match.groups.name' },
			{ token: '(?:abc)', meaning: 'Non-capturing group' },
			{ token: 'a|b', meaning: 'a or b' },
			{ token: '(?=abc)  (?!abc)', meaning: 'Followed by abc / not followed by abc (lookahead)' },
			{ token: '(?<=abc)  (?<!abc)', meaning: 'Preceded by abc / not preceded by abc (lookbehind)' }
		]
	}
];
