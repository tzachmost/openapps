/** Unit conversion data: one canonical "base" unit per category, every other unit
 *  defined as a pure round-trip to and from that base. All factors are the exact
 *  standard definitions (SI, the international yard-and-pound agreement, IEC binary
 *  prefixes) rather than rounded approximations — a chained conversion through the
 *  base is only as honest as the numbers it's built from. */

export type Unit = {
	id: string;
	label: string;
	symbol: string;
	/** Optional subheading rendered above this unit when it differs from the previous
	 *  unit's group — currently only Data uses this, to keep decimal (SI) and binary
	 *  (IEC) prefixes visually distinct instead of implying they're interchangeable. */
	group?: string;
	toBase: (value: number) => number;
	fromBase: (value: number) => number;
};

export type Category = {
	id: string;
	label: string;
	/** Sensible canonical-unit starting value when this category is first selected. */
	defaultBase: number;
	/** Temperature is the one category where a negative value is common and expected —
	 *  drives whether the row inputs restrict to a numeric-only mobile keypad. */
	allowNegative: boolean;
	units: Unit[];
};

function linear(factor: number): Pick<Unit, 'toBase' | 'fromBase'> {
	return { toBase: (v) => v * factor, fromBase: (v) => v / factor };
}

export const CATEGORIES: Category[] = [
	{
		id: 'length',
		label: 'Length',
		defaultBase: 1,
		allowNegative: false,
		units: [
			{ id: 'mm', label: 'Millimeters', symbol: 'mm', ...linear(0.001) },
			{ id: 'cm', label: 'Centimeters', symbol: 'cm', ...linear(0.01) },
			{ id: 'm', label: 'Meters', symbol: 'm', ...linear(1) },
			{ id: 'km', label: 'Kilometers', symbol: 'km', ...linear(1000) },
			{ id: 'in', label: 'Inches', symbol: 'in', ...linear(0.0254) },
			{ id: 'ft', label: 'Feet', symbol: 'ft', ...linear(0.3048) },
			{ id: 'yd', label: 'Yards', symbol: 'yd', ...linear(0.9144) },
			{ id: 'mi', label: 'Miles', symbol: 'mi', ...linear(1609.344) },
			{ id: 'nmi', label: 'Nautical miles', symbol: 'nmi', ...linear(1852) }
		]
	},
	{
		id: 'mass',
		label: 'Weight',
		defaultBase: 1,
		allowNegative: false,
		units: [
			{ id: 'mg', label: 'Milligrams', symbol: 'mg', ...linear(0.000001) },
			{ id: 'g', label: 'Grams', symbol: 'g', ...linear(0.001) },
			{ id: 'kg', label: 'Kilograms', symbol: 'kg', ...linear(1) },
			{ id: 't', label: 'Metric tons', symbol: 't', ...linear(1000) },
			{ id: 'oz', label: 'Ounces', symbol: 'oz', ...linear(0.028349523125) },
			{ id: 'lb', label: 'Pounds', symbol: 'lb', ...linear(0.45359237) },
			{ id: 'st', label: 'Stone', symbol: 'st', ...linear(6.35029318) },
			{ id: 'uston', label: 'US tons', symbol: 'ton', ...linear(907.18474) }
		]
	},
	{
		id: 'temperature',
		label: 'Temperature',
		defaultBase: 20,
		allowNegative: true,
		units: [
			{ id: 'c', label: 'Celsius', symbol: '°C', toBase: (v) => v, fromBase: (v) => v },
			{
				id: 'f',
				label: 'Fahrenheit',
				symbol: '°F',
				toBase: (v) => ((v - 32) * 5) / 9,
				fromBase: (v) => (v * 9) / 5 + 32
			},
			{
				id: 'k',
				label: 'Kelvin',
				symbol: 'K',
				toBase: (v) => v - 273.15,
				fromBase: (v) => v + 273.15
			}
		]
	},
	{
		id: 'area',
		label: 'Area',
		defaultBase: 1,
		allowNegative: false,
		units: [
			{ id: 'mm2', label: 'Sq. millimeters', symbol: 'mm²', ...linear(0.000001) },
			{ id: 'cm2', label: 'Sq. centimeters', symbol: 'cm²', ...linear(0.0001) },
			{ id: 'm2', label: 'Sq. meters', symbol: 'm²', ...linear(1) },
			{ id: 'ha', label: 'Hectares', symbol: 'ha', ...linear(10000) },
			{ id: 'km2', label: 'Sq. kilometers', symbol: 'km²', ...linear(1000000) },
			{ id: 'in2', label: 'Sq. inches', symbol: 'in²', ...linear(0.00064516) },
			{ id: 'ft2', label: 'Sq. feet', symbol: 'ft²', ...linear(0.09290304) },
			{ id: 'ac', label: 'Acres', symbol: 'ac', ...linear(4046.8564224) },
			{ id: 'mi2', label: 'Sq. miles', symbol: 'mi²', ...linear(2589988.110336) }
		]
	},
	{
		id: 'volume',
		label: 'Volume',
		defaultBase: 1,
		allowNegative: false,
		units: [
			{ id: 'ml', label: 'Milliliters', symbol: 'mL', ...linear(0.001) },
			{ id: 'l', label: 'Liters', symbol: 'L', ...linear(1) },
			{ id: 'm3', label: 'Cubic meters', symbol: 'm³', ...linear(1000) },
			{ id: 'tsp', label: 'Teaspoons (US)', symbol: 'tsp', ...linear(0.00492892159375) },
			{ id: 'tbsp', label: 'Tablespoons (US)', symbol: 'tbsp', ...linear(0.01478676478125) },
			{ id: 'floz', label: 'Fluid ounces (US)', symbol: 'fl oz', ...linear(0.0295735295625) },
			{ id: 'cup', label: 'Cups (US)', symbol: 'cup', ...linear(0.2365882365) },
			{ id: 'pt', label: 'Pints (US)', symbol: 'pt', ...linear(0.473176473) },
			{ id: 'qt', label: 'Quarts (US)', symbol: 'qt', ...linear(0.946352946) },
			{ id: 'gal', label: 'Gallons (US)', symbol: 'gal', ...linear(3.785411784) },
			{ id: 'galimp', label: 'Gallons (Imperial)', symbol: 'gal (UK)', ...linear(4.54609) }
		]
	},
	{
		id: 'speed',
		label: 'Speed',
		defaultBase: 1,
		allowNegative: false,
		units: [
			{ id: 'mps', label: 'Meters/second', symbol: 'm/s', ...linear(1) },
			{ id: 'kph', label: 'Kilometers/hour', symbol: 'km/h', ...linear(1 / 3.6) },
			{ id: 'mph', label: 'Miles/hour', symbol: 'mph', ...linear(0.44704) },
			{ id: 'kn', label: 'Knots', symbol: 'kn', ...linear(1852 / 3600) },
			{ id: 'fps', label: 'Feet/second', symbol: 'ft/s', ...linear(0.3048) }
		]
	},
	{
		id: 'time',
		label: 'Time',
		defaultBase: 1,
		allowNegative: false,
		units: [
			{ id: 'ms', label: 'Milliseconds', symbol: 'ms', ...linear(0.001) },
			{ id: 's', label: 'Seconds', symbol: 's', ...linear(1) },
			{ id: 'min', label: 'Minutes', symbol: 'min', ...linear(60) },
			{ id: 'h', label: 'Hours', symbol: 'h', ...linear(3600) },
			{ id: 'day', label: 'Days', symbol: 'd', ...linear(86400) },
			{ id: 'week', label: 'Weeks', symbol: 'wk', ...linear(604800) },
			{ id: 'year', label: 'Years', symbol: 'yr', ...linear(31557600) }
		]
	},
	{
		id: 'data',
		label: 'Data',
		defaultBase: 8,
		allowNegative: false,
		units: [
			{ id: 'bit', label: 'Bits', symbol: 'bit', group: 'Bits & bytes', ...linear(1) },
			{ id: 'byte', label: 'Bytes', symbol: 'B', group: 'Bits & bytes', ...linear(8) },
			{ id: 'kb', label: 'Kilobytes', symbol: 'kB', group: 'Decimal (SI, ×1000)', ...linear(8000) },
			{ id: 'mb', label: 'Megabytes', symbol: 'MB', group: 'Decimal (SI, ×1000)', ...linear(8e6) },
			{ id: 'gb', label: 'Gigabytes', symbol: 'GB', group: 'Decimal (SI, ×1000)', ...linear(8e9) },
			{ id: 'tb', label: 'Terabytes', symbol: 'TB', group: 'Decimal (SI, ×1000)', ...linear(8e12) },
			{
				id: 'kib',
				label: 'Kibibytes',
				symbol: 'KiB',
				group: 'Binary (IEC, ×1024)',
				...linear(8 * 1024)
			},
			{
				id: 'mib',
				label: 'Mebibytes',
				symbol: 'MiB',
				group: 'Binary (IEC, ×1024)',
				...linear(8 * 1024 ** 2)
			},
			{
				id: 'gib',
				label: 'Gibibytes',
				symbol: 'GiB',
				group: 'Binary (IEC, ×1024)',
				...linear(8 * 1024 ** 3)
			},
			{
				id: 'tib',
				label: 'Tebibytes',
				symbol: 'TiB',
				group: 'Binary (IEC, ×1024)',
				...linear(8 * 1024 ** 4)
			}
		]
	}
];

export function categoryById(id: string): Category {
	return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}
