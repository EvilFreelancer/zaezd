(() => {
	'use strict';

	const LOCAL_STORAGE_KEY = 'tutu-kite-theme';
	const DATA_ATTR_KEY = 'data-theme';
	const DATA_ATTR_STYLE = 'data-style';
	const LOCAL_STORAGE_EVENT_NAME = 'storage-theme';
	const notifyThemeChanged = () => window?.dispatchEvent?.(new Event(LOCAL_STORAGE_EVENT_NAME));
	const getLocalStorage = () => {
		try {
			if (localStorage) {
				return localStorage;
			}
		} catch (error) {
			console.error('[EXTERNAL] Access to localstorage denied');
		}
	};
	const getStoredTheme = () => {
		const ls = getLocalStorage();
		if (ls) {
			return ls.getItem(LOCAL_STORAGE_KEY);
		} else {
			return 'light';
		}
	};
	const setStoredTheme = theme => {
		const ls = getLocalStorage();
		if (ls) {
			ls.setItem(LOCAL_STORAGE_KEY, theme);
		}
	};
	const thisScript = document.currentScript;

	const getAppTheme = () => getStoredTheme() ?? 'light';
	const getAppStyle = () => {
		return thisScript.getAttribute('data-style') ?? 'on-white';
	};

	const applyTheme = theme => {
		document.documentElement.setAttribute(DATA_ATTR_KEY, theme);
	};

	const setAppTheme = theme => {
		if (theme !== 'light' && theme !== 'dark') {
			console.error('Invalid theme specified. Use "light" or "dark".');
			return;
		}
		applyTheme(theme);
		setStoredTheme(theme);
		notifyThemeChanged();
	};

	setAppTheme(getAppTheme());

	window.kiteSemanticColorStyle = getAppStyle();

	const applySemanticColorStyle = semanticColorStyle => {
		if (semanticColorStyle === 'on-grey') {
			document.documentElement.setAttribute(DATA_ATTR_STYLE, semanticColorStyle);
		} else {
			document.documentElement.removeAttribute(DATA_ATTR_STYLE);
		}
	};

	const setAppSemanticColorStyle = semanticColorStyle => {
		if (semanticColorStyle !== 'on-grey' && semanticColorStyle !== 'on-white') {
			console.error('Invalid semanticColorStyle specified. Use "on-grey" or "on-white".');
			return;
		}
		applySemanticColorStyle(semanticColorStyle);
	};

	setAppSemanticColorStyle(window.kiteSemanticColorStyle);

	window.setAppTheme = setAppTheme;
	window.setAppSemanticColorStyle = setAppSemanticColorStyle;
})();
