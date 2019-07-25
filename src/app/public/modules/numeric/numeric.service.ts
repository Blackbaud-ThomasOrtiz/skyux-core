import {
  Injectable
} from '@angular/core';

import {
  SkyIntlNumberFormatStyle
} from '@skyux/i18n/modules/i18n/intl-number-format-style';

import {
  SkyLibResourcesService
} from '@skyux/i18n';

import {
  NumericOptions
} from './numeric.options';

import {
  SkyNumericSymbol
} from './numeric-symbol';

import {
  SkyNumberFormatUtility
} from './number-format-utility';

@Injectable()
export class SkyNumericService {
  public shortSymbol: string;

  private symbolIndex: SkyNumericSymbol[] = [
    { value: 1E12, label: this.getSymbol('skyux_numeric_trillions_symbol') },
    { value: 1E9, label: this.getSymbol('skyux_numeric_billions_symbol') },
    { value: 1E6, label: this.getSymbol('skyux_numeric_millions_symbol') },
    { value: 1E3, label: this.getSymbol('skyux_numeric_thousands_symbol') }
  ];

  private defaultLocale = 'en-US';
​
  constructor(private resourcesService: SkyLibResourcesService) { }
​
  /**
   * Shortens with or without symbol (K/M/B/T) depending on value of number.
   * @param value The number to format.
   * @param options Format options.
   */
  public formatNumber(value: number, options: NumericOptions): string {
    /* tslint:disable-next-line:no-null-keyword */
    if (isNaN(value) || value === null) {
      return '';
    }

    const decimalPlaceRegExp = /\.0+$|(\.[0-9]*[1-9])0+$/;
    const symbol: SkyNumericSymbol = this.symbolIndex.find((si) => {
      // Checks both positive and negative of value to ensure
      // negative numbers are shortened.
      return options.truncate &&
        (
          (value >= options.truncateAfter && value >= si.value) ||
          (-value >= options.truncateAfter && -value >= si.value)
        );
    });

    let output: string;
    if (symbol) {
      const roundedNumber: number = this.roundNumber((value / symbol.value), options.digits);
      output = roundedNumber.toString().replace(decimalPlaceRegExp, '$1') + symbol.label;
    } else {
      const roundedNumber: number = this.roundNumber(value, options.digits);
      output = roundedNumber.toString().replace(decimalPlaceRegExp, '$1');
    }

    this.storeShortenSymbol(output);

    let digits: string;
    // Checks the string entered for format. Using toLowerCase to ignore case.
    switch (options.format.toLowerCase()) {

      // In a case where a decimal value was not shortened and
      // the digit input is 2 or higher, it forces 2 digits.
      // For example, this prevents a value like $15.50 from displaying as $15.5.
      // Note: This will need to be reviewed if we support currencies with
      // three decimal digits.
      case 'currency':
        const isShortened = (value > this.symbolIndex[this.symbolIndex.length - 1].value);
        const isDecimal = (value % 1 !== 0);

        if (options.minDigits) {
          digits = `1.${options.minDigits}-${options.digits}`;
        } else if (!isShortened && isDecimal && options.digits >= 2) {
          digits = `1.2-${options.digits}`;
        } else {
          digits = `1.0-${options.digits}`;
        }

        // Angular 5+ needs a string for this parameter, but Angular 4 needs a boolean.
        // To support both versions we can supply 'symbol' which will evaluate truthy for Angular 4
        // and the appropriate string value for Angular 5+.
        // See: https://angular.io/api/common/CurrencyPipe#parameters
        const symbolDisplay: any = 'symbol';

        output = SkyNumberFormatUtility.formatNumber(
          this.defaultLocale,
          parseFloat(output),
          SkyIntlNumberFormatStyle.Currency,
          digits,
          options.iso,
          symbolDisplay
        );
        break;

      // The following is a catch-all to ensure that if
      // anything but currency (or a future option) are entered,
      // it will be treated like a number.
      default:
        // Ensures localization of the number to ensure comma and
        // decimal separator
        if (options.minDigits) {
          digits = `1.${options.minDigits}-${options.digits}`;
        } else if (options.truncate) {
          digits = `1.0-${options.digits}`;
        } else {
          digits = `1.${options.digits}-${options.digits}`;
        }

        output = SkyNumberFormatUtility.formatNumber(
          this.defaultLocale,
          parseFloat(output),
          SkyIntlNumberFormatStyle.Decimal,
          digits
        );
        break;
    }

    if (options.truncate) {
      output = this.replaceShortenSymbol(output);
    }

    return output;
  }

  /**
   * Rounds a given number
   *
   * JS's limitation - numbers bigger than Number.MIN_SAFE_INTEGER or Number.MAX_SAFE_INTEGER
   * are not guaranteed to be represented or rounded correctly
   * @param value - value to round
   * @param precision - what precision to round with, defaults to 0 decimal places
   */
  public roundNumber(value: number, precision: number = 0): number {
    if (precision < 0) { throw new Error('SkyInvalidArgument: precision must be >= 0'); }
​
    /* tslint:disable-next-line:no-null-keyword */
    if (isNaN(value) || value === null) { return 0; }
​
    const scaledValue: number = this.scaleNumberByPowerOfTen(value, precision, true);
    const scaledRoundedValue: number = Math.round(scaledValue);
    const unscaledRoundedValue: number = this.scaleNumberByPowerOfTen(
      scaledRoundedValue,
      precision,
      false
    );
​
    return unscaledRoundedValue;
  }
​
  /**
   * Scales a given number by a power of 10
   * @param value - value to scale
   * @param scalar - 10^scalar
   * @param scaleUp - whether to increase or decrease the value
   */
  private scaleNumberByPowerOfTen(value: number, scalar: number, scaleUp: boolean): number {
    const valueStr: string = value.toString().toLowerCase();
    const isExponentFormat: boolean = valueStr.includes('e');
​
    if (isExponentFormat) {
      const [base, exp] = valueStr.split('e');
      const newExp = scaleUp ? (Number(exp) + scalar) : (Number(exp) - scalar);
      return Number(`${base}e${newExp}`);
    } else {
      const e = scaleUp ? 'e'  : 'e-';
      return Number(`${value}${e}${scalar}`);
    }
  }
​
  /**
   * Stores the symbol added from shortening to reapply later.
   * @param value The string to derive the shorten symbol from.
   */
  private storeShortenSymbol(value: string): void {
    const symbols: string[] = this.symbolIndex.map(s => s.label);
    const regexp = new RegExp(symbols.join('|'), 'ig');
    const match = value.match(regexp);
    this.shortSymbol = (match) ? match.toString() : '';
  }

  /**
   * Must have previously called storeShortenSymbol to have something to replace.
   * Finds the last number in the formatted number, gets the index of the position
   * after that character and re-inserts the symbol.
   * Works regardless of currency symbol position.
   * @param value The string to modify.
   */
  private replaceShortenSymbol(value: string): string {
    const result = /(\d)(?!.*\d)/g.exec(value);
    const pos = result.index + result.length;
    const output = value.substring(0, pos) + this.shortSymbol + value.substring(pos);

    return output;
  }

  private getSymbol(key: string): string {
    // TODO: Need to implement the async `getString` method in a breaking change.
    return this.resourcesService.getStringForLocale(
      { locale: 'en_US' },
      key
    );
  }
}
