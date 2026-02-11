/**
 * CurrencySettingsOverlay - Currency selection with search and favorites
 * Extracted from Dashboard.js
 */

export default function CurrencySettingsOverlay({
  displayCurrency,
  currencyFilter,
  currencyFilterDebounced,
  currenciesLoading,
  darkMode,
  isBlinkClassic,
  isBlinkClassicDark,
  isBlinkClassicLight,
  setDisplayCurrency,
  setShowCurrencySettings,
  setCurrencyFilter,
  getAllCurrencies,
  isPopularCurrency,
  addToPopular,
  removeFromPopular,
  getSubmenuBgClasses,
  getSubmenuHeaderClasses,
  getSubmenuOptionClasses,
  getSubmenuOptionActiveClasses,
  getPrimaryTextClasses,
  getSecondaryTextClasses,
  getCheckmarkClasses,
}) {
  // Render a currency button
  const renderCurrencyButton = (currency) => (
    <button
      key={currency.id}
      onClick={() => {
        setDisplayCurrency(currency.id);
        setShowCurrencySettings(false);
      }}
      className={`w-full p-3 text-left transition-all ${
        displayCurrency === currency.id
          ? getSubmenuOptionActiveClasses()
          : getSubmenuOptionClasses()
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${getPrimaryTextClasses()}`}>
          {currency.flag ? `${currency.flag} ` : ''}{currency.baseId || currency.id} - {currency.name}
        </span>
        <div className="flex items-center gap-2">
          {/* Star button for popular toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isPopularCurrency(currency.id)) {
                removeFromPopular(currency.id);
              } else {
                addToPopular(currency.id);
              }
            }}
            className={`p-1 rounded transition-colors ${
              isPopularCurrency(currency.id) 
                ? 'text-yellow-500 hover:text-yellow-400' 
                : `${getSecondaryTextClasses()} hover:text-yellow-500`
            }`}
            title={isPopularCurrency(currency.id) ? 'Remove from favorites' : 'Add to favorites'}
          >
            <svg className="w-4 h-4" fill={isPopularCurrency(currency.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
          {displayCurrency === currency.id && (
            <svg className={`w-5 h-5 ${getCheckmarkClasses()}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );

  return (
    <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
      <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Header */}
        <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <button
                onClick={() => setShowCurrencySettings(false)}
                className={`flex items-center ${getPrimaryTextClasses()} hover:text-blink-classic-amber`}
              >
                <span className="text-2xl mr-2">‹</span>
                <span className="text-lg">Back</span>
              </button>
              <h1 className={`text-xl font-bold ${getPrimaryTextClasses()}`}>
                Currency
              </h1>
              <div className="w-16"></div>
            </div>
          </div>
          
          {/* Search Input - Sticky below header */}
          <div className="max-w-md mx-auto px-4 pb-3">
            <div className="relative">
              <input
                type="text"
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
                placeholder="Search currency, country..."
                className={`w-full px-4 py-2.5 pl-10 rounded-lg text-sm ${
                  isBlinkClassicDark 
                    ? 'bg-black border border-blink-classic-border text-white placeholder-gray-500 focus:border-blink-classic-amber' 
                    : isBlinkClassicLight
                      ? 'bg-white border border-blink-classic-border-light text-black placeholder-gray-400 focus:border-blink-classic-amber'
                      : darkMode
                        ? 'bg-gray-900 border border-gray-700 text-white placeholder-gray-500 focus:border-blue-500'
                        : 'bg-gray-50 border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
                } focus:outline-none focus:ring-1 ${
                  isBlinkClassic ? 'focus:ring-blink-classic-amber' : 'focus:ring-blue-500'
                }`}
              />
              <svg className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${getSecondaryTextClasses()}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {currencyFilter && (
                <button
                  onClick={() => setCurrencyFilter('')}
                  className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${getSecondaryTextClasses()} hover:${getPrimaryTextClasses()}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Currency List */}
        <div className="max-w-md mx-auto px-4 py-4">
          {currenciesLoading ? (
            <div className={`text-center py-4 ${getSecondaryTextClasses()}`}>Loading...</div>
          ) : (() => {
            const { popular, all } = getAllCurrencies();
            const filterLower = currencyFilterDebounced.toLowerCase().trim();
            
            // Filter function for currencies
            const matchesCurrency = (currency) => {
              if (!filterLower) return true;
              const id = (currency.baseId || currency.id || '').toLowerCase();
              const name = (currency.name || '').toLowerCase();
              const country = (currency.country || '').toLowerCase();
              return id.includes(filterLower) || name.includes(filterLower) || country.includes(filterLower);
            };
            
            const filteredPopular = popular.filter(matchesCurrency);
            const filteredAll = all.filter(matchesCurrency);
            
            // If filtering, show flat list
            if (filterLower) {
              const allFiltered = [...filteredPopular, ...filteredAll];
              if (allFiltered.length === 0) {
                return (
                  <div className={`text-center py-8 ${getSecondaryTextClasses()}`}>
                    No currencies match "{currencyFilterDebounced}"
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  {allFiltered.map(renderCurrencyButton)}
                </div>
              );
            }
            
            // Normal view with sections
            return (
              <div className="space-y-2">
                {/* Popular Section */}
                {filteredPopular.length > 0 && (
                  <>
                    {filteredPopular.map(renderCurrencyButton)}
                    
                    {/* Visual divider between popular and all */}
                    <div className={`my-4 border-t ${
                      isBlinkClassicDark ? 'border-blink-classic-border' :
                      isBlinkClassicLight ? 'border-blink-classic-border-light' :
                      darkMode ? 'border-gray-700' : 'border-gray-200'
                    }`} />
                  </>
                )}
                
                {/* All Other Currencies */}
                {filteredAll.map(renderCurrencyButton)}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
