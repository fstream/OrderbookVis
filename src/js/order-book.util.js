/**
 * Order Book - Utilities
 */

//
// MISC
//
function _time(t) {
  return moment(t).format('h:mm:ss a');
}

function _levelColour(v, max) {
  var c = (1 - v/max)*205 + 50;

  return d3.rgb( c, c, c);
}


//
// SVG
// 

function _line(x1, y1, x2, y2) {
  return 'M' + x1 + ',' + y1 + 'L' + x2 + ',' + y2;
}

function _translate(x, y) {
  return 'translate(' + x + ',' + y + ')';
}

//
// Events
//

function groupTradesByTime(trades) {
   return _(trades)
      .groupBy('dateTime')
      .map(function (trades, dateTime) {
         return {
            dateTime: dateTime,
            trades: trades
         };
      })
      .value();
}

function groupQuotesSideByPriceLevel(quotes, side) {
   return _(quotes)
      .groupBy(side)
      .map(function (quotes, price) {
         return {
            price: price,
            quotes: quotes
         };
      })
      .value();
}

