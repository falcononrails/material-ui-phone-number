import React from 'react';
import PropTypes from 'prop-types';
import { TextField, InputAdornment, Menu, MenuItem, Button, withStyles } from '@material-ui/core';
import { some, find, reduce, map, filter, includes } from 'lodash/collection';
import { findIndex, head, tail } from 'lodash/array';
import { debounce, memoize } from 'lodash/function';
import { trim, startsWith } from 'lodash/string';
import classNames from 'classnames';
import { document } from './global.js';
import countryData from './country_data.js';
import './styles.less';
import './flags.png';

const styles = () => ({
  flag: {
    height: 16,
    width: 11,
    background: 'url("./flags.png")',
  },
  flagButton: {
    minWidth: 30,
    padding: 0,
  }
});

class MaterialReactPhoneInput extends React.Component {
  static propTypes = {
    excludeCountries: PropTypes.arrayOf(PropTypes.string),
    onlyCountries: PropTypes.arrayOf(PropTypes.string),
    preferredCountries: PropTypes.arrayOf(PropTypes.string),
    defaultCountry: PropTypes.string,

    value: PropTypes.string,
    placeholder: PropTypes.string,
    name: PropTypes.string,
    required: PropTypes.bool,
    disabled: PropTypes.bool,
    autoFocus: PropTypes.bool,

    inputStyle: PropTypes.object,
    buttonStyle: PropTypes.object,
    dropdownStyle: PropTypes.object,

    inputClass: PropTypes.string,
    buttonClass: PropTypes.string,
    dropdownClass: PropTypes.string,
    inputComponent: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.func,
      PropTypes.object
    ]),
    dropdownComponent: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.func,
      PropTypes.object
    ]),
    inputProps: PropTypes.object,

    autoFormat: PropTypes.bool,
    disableAreaCodes: PropTypes.bool,
    disableCountryCode: PropTypes.bool,
    disableDropdown: PropTypes.bool,
    enableLongNumbers: PropTypes.bool,
    countryCodeEditable: PropTypes.bool,

    regions: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.arrayOf(PropTypes.string)
    ]),

    localization: PropTypes.object,

    onChange: PropTypes.func,
    onFocus: PropTypes.func,
    onBlur: PropTypes.func,
    onClick: PropTypes.func,
    onKeyDown: PropTypes.func
  }

  static defaultProps = {
    excludeCountries: [],
    onlyCountries: [],
    preferredCountries: [],
    defaultCountry: '',

    value: '',
    placeholder: '+1 (702) 123-4567',
    flagsImagePath: './flags.png',
    name: '',
    required: false,
    disabled: false,
    autoFocus: false,

    containerStyle: {},
    inputStyle: {},
    buttonStyle: {},
    dropdownStyle: {},

    inputClass: '',
    buttonClass: '',
    dropdownClass: '',
    inputComponent: 'input',
    dropdownComponent: 'div',

    autoFormat: true,
    disableAreaCodes: false,
    isValid: (inputNumber) => {
      return some(countryData.allCountries, (country) => {
        return startsWith(inputNumber, country.dialCode) || startsWith(country.dialCode, inputNumber);
      });
    },
    disableCountryCode: false,
    disableDropdown: false,
    enableLongNumbers: false,
    countryCodeEditable: true,

    regions: '',

    localization: {},

    onEnterKeyPress: () => {},

    isModernBrowser: document.createElement ? (
      Boolean(document.createElement('input').setSelectionRange)
    ) : false,

    keys: {
      UP: 38, DOWN: 40, RIGHT: 39, LEFT: 37, ENTER: 13,
      ESC: 27, PLUS: 43, A: 65, Z: 90, SPACE: 32
    }
  }

  constructor(props) {
    super(props);
    let filteredCountries = countryData.allCountries;

    if (props.disableAreaCodes) filteredCountries = this.deleteAreaCodes(filteredCountries);
    if (props.regions) filteredCountries = this.filterRegions(props.regions, filteredCountries);

    const onlyCountries = this.excludeCountries(
      this.getOnlyCountries(props.onlyCountries, filteredCountries), props.excludeCountries);

    const preferredCountries = filter(filteredCountries, (country) => {
      return some(props.preferredCountries, (preferredCountry) => {
        return preferredCountry === country.iso2;
      });
    });

    const inputNumber = props.value || '';

    let countryGuess;
    if (inputNumber.length > 1) {
      // Country detect by value field
      countryGuess = this.guessSelectedCountry(inputNumber.substring(1, 6), onlyCountries, props.defaultCountry) || 0;
    } else if (props.defaultCountry) {
      // Default country
      countryGuess = find(onlyCountries, {iso2: props.defaultCountry}) || 0;
    } else {
      // Empty params
      countryGuess = 0;
    }

    const countryGuessIndex = findIndex(this.allCountries, countryGuess);
    const dialCode = (
      inputNumber.length < 2 &&
      countryGuess &&
      !startsWith(inputNumber.replace(/\D/g, ''), countryGuess.dialCode)
    ) ? countryGuess.dialCode : '';

    let formattedNumber;
    formattedNumber = (inputNumber === '' && countryGuess === 0) ? '' :
    this.formatNumber(
      (props.disableCountryCode ? '' : dialCode) + inputNumber.replace(/\D/g, ''),
      countryGuess.name ? countryGuess.format : undefined
    );

    this.state = {
      formattedNumber,
      placeholder: props.placeholder,
      onlyCountries,
      preferredCountries,
      defaultCountry: props.defaultCountry,
      selectedCountry: countryGuess,
      highlightCountryIndex: countryGuessIndex,
      queryString: '',
      freezeSelection: false,
      debouncedQueryStingSearcher: debounce(this.searchCountry, 100),
      anchorEl: null,
    };
  }

  componentDidMount() {
    if (document.addEventListener) {
      document.addEventListener('keydown', this.handleKeydown);
    }
  }

  componentWillUnmount() {
    if (document.removeEventListener) {
      document.removeEventListener('keydown', this.handleKeydown);
    }
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.defaultCountry && nextProps.defaultCountry !== this.state.defaultCountry) {
      this.updateDefaultCountry(nextProps.defaultCountry);
    }
    if (nextProps.value !== this.state.formattedNumber) {
      this.updateFormattedNumber(nextProps.value);
    }
  }

  // Countries array methods
  deleteAreaCodes = (filteredCountries) => {
    return filteredCountries.filter((country) => {
      return country.isAreaCode !== true;
    });
  }

  filterRegions = (regions, filteredCountries) => {
    if (typeof regions === 'string') {
      const region = regions;
      return filteredCountries.filter((country) => {
        return country.regions.some((element) => {
          return element === region;
        });
      });
    }

    return filteredCountries.filter((country) => {
      const matches = regions.map((region) => {
        return country.regions.some((element) => {
          return element === region;
        });
      });
      return matches.some(el => el);
    });
  }

  getOnlyCountries = (onlyCountriesArray, filteredCountries) => {
    if (onlyCountriesArray.length === 0) return filteredCountries;

    return filteredCountries.filter((country) => {
      return onlyCountriesArray.some((element) => {
        return element === country.iso2;
      });
    });
  }

  excludeCountries = (selectedCountries, excludedCountries) => {
    if (excludedCountries.length === 0) {
      return selectedCountries;
    } else {
      return filter(selectedCountries, (selCountry) => {
        return !includes(excludedCountries, selCountry.iso2);
      });
    }
  }

  getProbableCandidate = memoize((queryString) => {
    if (!queryString || queryString.length === 0) {
      return null;
    }
    // don't include the preferred countries in search
    const probableCountries = filter(this.state.onlyCountries, (country) => {
      return startsWith(country.name.toLowerCase(), queryString.toLowerCase());
    }, this);
    return probableCountries[0];
  });

  guessSelectedCountry = memoize((inputNumber, onlyCountries, defaultCountry) => {
    const secondBestGuess = find(onlyCountries, {iso2: defaultCountry}) || {};
    if (trim(inputNumber) === '') return secondBestGuess;

    const bestGuess = reduce(onlyCountries, (selectedCountry, country) => {
      if (startsWith(inputNumber, country.dialCode)) {
        if (country.dialCode.length > selectedCountry.dialCode.length) {
          return country;
        }
        if (country.dialCode.length === selectedCountry.dialCode.length && country.priority < selectedCountry.priority) {
          return country;
        }
      }
      return selectedCountry;
    }, {dialCode: '', priority: 10001}, this);

    if (!bestGuess.name) return secondBestGuess;
    return bestGuess;
  });

  // Hooks for updated props
  updateDefaultCountry = (country) => {
    const newSelectedCountry = find(this.state.onlyCountries, {iso2: country});
    this.setState({
      defaultCountry: country,
      selectedCountry: newSelectedCountry,
      formattedNumber: this.props.disableCountryCode ? '' : '+' + newSelectedCountry.dialCode
    });
  }

  updateFormattedNumber(number) {
    const { onlyCountries, defaultCountry } = this.state;
    let countryGuess;
    let inputNumber = number;
    let formattedNumber = number;

    // if inputNumber does not start with '+', then use default country's dialing prefix,
    // otherwise use logic for finding country based on country prefix.
    if (!inputNumber.startsWith('+')) {
      countryGuess = find(onlyCountries, {iso2: defaultCountry});
      const dialCode = countryGuess && !startsWith(inputNumber.replace(/\D/g, ''), countryGuess.dialCode) ? countryGuess.dialCode : '';
      formattedNumber = this.formatNumber(
        (this.props.disableCountryCode ? '' : dialCode) + inputNumber.replace(/\D/g, ''),
        countryGuess ? countryGuess.format : undefined
      );
    }
    else {
      inputNumber = inputNumber.replace(/\D/g, '');
      countryGuess = this.guessSelectedCountry(inputNumber.substring(0, 6), onlyCountries, defaultCountry);
      formattedNumber = this.formatNumber(inputNumber, countryGuess.format);
    }

    this.setState({ selectedCountry: countryGuess, formattedNumber });
  }

  // View methods
  scrollTo = (country, middle) => {
    if (!country)
      return;

    const container = this.dropdownRef;

    if (!container || !document.body)
      return;

    const containerHeight = container.offsetHeight;
    const containerOffset = container.getBoundingClientRect();
    const containerTop = containerOffset.top + document.body.scrollTop;
    const containerBottom = containerTop + containerHeight;

    const element = country;
    const elementOffset = element.getBoundingClientRect();

    const elementHeight = element.offsetHeight;
    const elementTop = elementOffset.top + document.body.scrollTop;
    const elementBottom = elementTop + elementHeight;

    let newScrollTop = elementTop - containerTop + container.scrollTop;
    const middleOffset = (containerHeight / 2) - (elementHeight / 2);

    if (elementTop < containerTop) {
      // scroll up
      if (middle) {
        newScrollTop -= middleOffset;
      }
      container.scrollTop = newScrollTop;
    }
    else if (elementBottom > containerBottom) {
      // scroll down
      if (middle) {
        newScrollTop += middleOffset;
      }
      const heightDifference = containerHeight - elementHeight;
      container.scrollTop = newScrollTop - heightDifference;
    }
  }

  formatNumber = (text, patternArg) => {
    const { disableCountryCode, enableLongNumbers, autoFormat } = this.props;

    let pattern;
    if (disableCountryCode && patternArg) {
      pattern = patternArg.split(' ');
      pattern.shift();
      pattern = pattern.join(' ');
    } else {
      pattern = patternArg;
    }

    if (!text || text.length === 0) {
      return disableCountryCode ? '' : '+';
    }

    // for all strings with length less than 3, just return it (1, 2 etc.)
    // also return the same text if the selected country has no fixed format
    if ((text && text.length < 2) || !pattern || !autoFormat) {
      return disableCountryCode ? text : `+${text}`;
    }

    const formattedObject = reduce(pattern, (acc, character) => {
      if (acc.remainingText.length === 0) {
        return acc;
      }

      if (character !== '.') {
        return {
          formattedText: acc.formattedText + character,
          remainingText: acc.remainingText
        };
      }

      return {
        formattedText: acc.formattedText + head(acc.remainingText),
        remainingText: tail(acc.remainingText)
      };
    }, {
      formattedText: '',
      remainingText: text.split('')
    });

    let formattedNumber;
    if (enableLongNumbers) {
      formattedNumber = formattedObject.formattedText + formattedObject.remainingText.join('');
    } else {
      formattedNumber = formattedObject.formattedText;
    }

    // Always close brackets
    if (formattedNumber.includes('(') && !formattedNumber.includes(')')) formattedNumber += ')';
    return formattedNumber;
  }

  // Put the cursor to the end of the input (usually after a focus event)
  cursorToEnd = () => {
    const input = this.inputRef;
    input.focus();
    if (this.props.isModernBrowser) {
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }

  getElement = (index) => {
    return this[`flag_no_${index}`];
  }

  // return country data from state
  getCountryData = () => {
    if (!this.state.selectedCountry) return {}
    return {
      name: this.state.selectedCountry.name || '',
      dialCode: this.state.selectedCountry.dialCode || '',
      countryCode: this.state.selectedCountry.iso2 || ''
    }
  }

  handleFlagDropdownClick = () => {
    if (!this.state.anchorEl && this.props.disabled) return;

    if (this.state.preferredCountries.includes(this.state.selectedCountry)) {
      this.setState({
        highlightCountryIndex: findIndex(this.state.preferredCountries, this.state.selectedCountry)
      }, () => {
        if (this.state.anchorEl) {
          this.scrollTo(this.getElement(this.state.highlightCountryIndex));
        }
      });
    }
    else {
      this.setState({
        highlightCountryIndex: findIndex(this.state.onlyCountries, this.state.selectedCountry)
      }, () => {
        if (this.state.anchorEl) {
          this.scrollTo(this.getElement(this.state.highlightCountryIndex + this.state.preferredCountries.length));
        }
      });
    }
  }

  handleInput = (e) => {
    let formattedNumber = this.props.disableCountryCode ? '' : '+';
    let newSelectedCountry = this.state.selectedCountry;
    let freezeSelection = this.state.freezeSelection;

    if(!this.props.countryCodeEditable) {
        const updatedInput = '+' + newSelectedCountry.dialCode;
        if (e.target.value.length < updatedInput.length) {
            return;
        }
    }

    //Does not exceed 15 digit phone number limit
    if (e.target.value.replace(/\D/g, '').length > 15) {
      return;
    }

    // if the input is the same as before, must be some special key like enter etc.
    if (e.target.value === this.state.formattedNumber) {
      return;
    }

    // ie hack
    if (e.preventDefault) {
      e.preventDefault();
    } else {
      e.returnValue = false;
    }

    if (e.target.value.length > 0) {
      // before entering the number in new format, lets check if the dial code now matches some other country
      const inputNumber = e.target.value.replace(/\D/g, '');

      // we don't need to send the whole number to guess the country... only the first 6 characters are enough
      // the guess country function can then use memoization much more effectively since the set of input it
      // gets has drastically reduced
      if (!this.state.freezeSelection || this.state.selectedCountry.dialCode.length > inputNumber.length) {
        newSelectedCountry = this.guessSelectedCountry(inputNumber.substring(0, 6), this.state.onlyCountries, this.state.defaultCountry);
        freezeSelection = false;
      }
      // let us remove all non numerals from the input
      formattedNumber = this.formatNumber(inputNumber, newSelectedCountry.format);
    }

    let caretPosition = e.target.selectionStart;
    const oldFormattedText = this.state.formattedNumber;
    const diff = formattedNumber.length - oldFormattedText.length;

    this.setState({
      formattedNumber: formattedNumber,
      freezeSelection: freezeSelection,
      selectedCountry: newSelectedCountry.dialCode
        ? newSelectedCountry
        : this.state.selectedCountry
    }, () => {
      if (this.props.isModernBrowser) {
        if (diff > 0) {
          caretPosition = caretPosition - diff;
        }

        const lastChar = formattedNumber.charAt(formattedNumber.length - 1);

        if (lastChar === ')') {
          this.inputRef.setSelectionRange(formattedNumber.length - 1, formattedNumber.length - 1);
        }
        else if (caretPosition > 0 && oldFormattedText.length >= formattedNumber.length) {
          this.inputRef.setSelectionRange(caretPosition, caretPosition);
        }
      }

      if (this.props.onChange) {
        this.props.onChange(this.state.formattedNumber, this.getCountryData());
      }
    });
  }

  handleRefInput = ref => {
    this.inputRef = ref;

    let refProp;

    if (this.props.inputRef) {
      refProp = this.props.inputRef;
    } else if (this.props.inputProps && this.props.inputProps.ref) {
      refProp = this.props.inputProps.ref;
    }

    if (refProp) {
      if (typeof refProp === 'function') {
        refProp(ref);
      } else {
        refProp.current = ref;
      }
    }
  };

  handleInputClick = (e) => {
    if (this.props.onClick) this.props.onClick(e, this.getCountryData());
  }

  handleFlagItemClick = (country) => {
    const currentSelectedCountry = this.state.selectedCountry;
    const nextSelectedCountry = find(this.state.onlyCountries, country);

    const unformattedNumber = this.state.formattedNumber.replace(' ', '').replace('(', '').replace(')', '').replace('-', '');
    const newNumber = unformattedNumber.length > 1 ? unformattedNumber.replace(currentSelectedCountry.dialCode, nextSelectedCountry.dialCode) : nextSelectedCountry.dialCode;
    const formattedNumber = this.formatNumber(newNumber.replace(/\D/g, ''), nextSelectedCountry.format);

    this.setState({
      anchorEl: null,
      selectedCountry: nextSelectedCountry,
      freezeSelection: true,
      formattedNumber
    }, () => {
      this.cursorToEnd();
      if (this.props.onChange) {
        this.props.onChange(formattedNumber, this.getCountryData());
      }
    });
  }

  handleInputFocus = (e) => {
    // if the input is blank, insert dial code of the selected country
    if (this.inputRef) {
      if (this.inputRef.value === '+' && this.state.selectedCountry && !this.props.disableCountryCode) {
        this.setState({
          formattedNumber: '+' + this.state.selectedCountry.dialCode
        }, () => setTimeout(this.cursorToEnd, 10));
      }
    }

    this.setState({ placeholder: '' });

    this.props.onFocus && this.props.onFocus(e, this.getCountryData());
    setTimeout(this.cursorToEnd, 10);
  }

  handleInputBlur = (e) => {
    if (!e.target.value) this.setState({ placeholder: this.props.placeholder });
    this.props.onBlur && this.props.onBlur(e, this.getCountryData());
  }

  getHighlightCountryIndex = (direction) => {
    // had to write own function because underscore does not have findIndex. lodash has it
    const highlightCountryIndex = this.state.highlightCountryIndex + direction;

    if (highlightCountryIndex < 0 || highlightCountryIndex >= (this.state.onlyCountries.length + this.state.preferredCountries.length)) {
      return highlightCountryIndex - direction;
    }

    return highlightCountryIndex;
  }

  searchCountry = () => {
    const probableCandidate = this.getProbableCandidate(this.state.queryString) || this.state.onlyCountries[0];
    const probableCandidateIndex = findIndex(this.state.onlyCountries, probableCandidate) + this.state.preferredCountries.length;

    this.scrollTo(this.getElement(probableCandidateIndex), true);

    this.setState({queryString: '', highlightCountryIndex: probableCandidateIndex});
  }

  handleKeydown = (e) => {
    const { keys } = this.props;
    if (!this.state.anchorEl || this.props.disabled) return;

    // ie hack
    if (e.preventDefault) {
      e.preventDefault();
    } else {
      e.returnValue = false;
    }

    const moveHighlight = (direction) => {
      this.setState({
        highlightCountryIndex: this.getHighlightCountryIndex(direction)
      }, () => {
        this.scrollTo(this.getElement(
          this.state.highlightCountryIndex + this.state.preferredCountries.length
        ), true);
      });
    }

    switch (e.which) {
      case keys.DOWN:
        moveHighlight(1);
        break;
      case keys.UP:
        moveHighlight(-1);
        break;
      case keys.ENTER:
        this.handleFlagItemClick(this.state.onlyCountries[this.state.highlightCountryIndex], e);
        break;
      case keys.ESC:
        this.setState({
          anchorEl: null,
        }, this.cursorToEnd);
        break;
      default:
        if ((e.which >= keys.A && e.which <= keys.Z) || e.which === keys.SPACE) {
          this.setState({
            queryString: this.state.queryString + String.fromCharCode(e.which)
          }, this.state.debouncedQueryStingSearcher);
        }
    }
  }

  handleInputKeyDown = (e) => {
    const { keys } = this.props;
    if (e.which === keys.ENTER) {
      this.props.onEnterKeyPress(e);
    }

    if (this.props.onKeyDown) this.props.onKeyDown(e);
  }

  getCountryDropdownList = () => {
    const { preferredCountries, onlyCountries, highlightCountryIndex, anchorEl } = this.state;
    const countryIsPreferred = this.state.preferredCountries.includes(this.state.selectedCountry);

    let countryDropdownList = map(preferredCountries.concat(onlyCountries), (country, index) => {
      const itemClasses = classNames({
        country: true,
        preferred: country.iso2 === 'us' || country.iso2 === 'gb',
        active: country.iso2 === 'us',
        highlight: countryIsPreferred ? highlightCountryIndex === index : highlightCountryIndex === index - preferredCountries.length
      });

      const inputFlagClasses = `flag ${country.iso2} margin`;

      return (
        <MenuItem
          ref={el => this[`flag_no_${index}`] = el}
          key={`flag_no_${index}`}
          data-flag-key={`flag_no_${index}`}
          className={itemClasses}
          data-dial-code="1"
          data-country-code={country.iso2}
          onClick={() => this.handleFlagItemClick(country)}
        >
          <div className={inputFlagClasses}/>
          <span className='country-name'>{
              this.props.localization[country.name] != undefined ?
              this.props.localization[country.name] : country.name
          }</span>
          <span className='dial-code'>{'+' + country.dialCode}</span>
        </MenuItem>
      );
    });

    const dashedLi = (<li key={'dashes'} className='divider'/>);
    // let's insert a dashed line in between preffered countries and the rest
    (preferredCountries.length > 0) &&
    countryDropdownList.splice(preferredCountries.length, 0, dashedLi);

    const dropDownClasses = classNames({
      [this.props.dropdownClass]: true,
      'country-list': true,
    });

    return (
      <Menu
        id="country-menu"
        ref={el => this.dropdownRef = el}
        className={dropDownClasses}
        open={Boolean(anchorEl)}
        onClose={() => {this.setState({ anchorEl: null });}}
      >
        {countryDropdownList}
      </Menu>
    );
  }

  render() {
    const { selectedCountry, formattedNumber, anchorEl } = this.state;
    const { classes } = this.props;

    const inputClasses = classNames({
      [this.props.inputClass]: true,
      "invalid-number": !this.props.isValid(formattedNumber.replace(/\D/g, ''))
    });
    const inputFlagClasses = `flag ${selectedCountry.iso2}`;

    return (
      <TextField
        placeholder={this.state.placeholder}
        onChange={this.handleInput}
        onClick={this.handleInputClick}
        onFocus={this.handleInputFocus}
        onBlur={this.handleInputBlur}
        onKeyDown={this.handleInputKeyDown}
        value={formattedNumber}
        className={inputClasses}
        required={this.props.required}
        disabled={this.props.disabled}
        autoFocus={this.props.autoFocus}
        inputRef={this.handleRefInput}
        name={this.props.name}
        label={this.props.label}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start" ref={el => this.dropdownContainerRef = el}>
              <Button
                className={classes.flagButton}
                aria-owns={anchorEl ? 'country-menu' : null}
                aria-label="Select country"
                onClick={(event) => {
                  this.setState({ anchorEl: event.currentTarget });
                  this.handleFlagDropdownClick(event);
                }}
                ref={el => this.dropdownContainerRef = el}
                aria-haspopup
              >
                <div className={inputFlagClasses} />
              </Button>

              {this.getCountryDropdownList()}
            </InputAdornment>
          )
        }}
        type="tel"
      />
    );
  }
}

const PhoneInput = withStyles(styles)(MaterialReactPhoneInput);

export default PhoneInput;

if (__DEV__) require('./demo.js');