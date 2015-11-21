/* Before the Beginning */
BookViewer = function(config) {
  var _this = this;
  var defaultConfig = {

    // SVG
    svgWidth: 1200,
    svgHeight: 500,

    // Main display panel size
    width: 1000,
    height: 400,

    // Time to keep - in millis
    windowSize: 1000 * 60 * 2,

    // Delete things order than
    keepAliveTime: 60 * 1000 * 10,

    /**
     * limitPercent controls at what percentage of windowSize we want to start shifting
     * pullBackPercent controls what percentage of windowSize to shift to the left
     *
     * So:
     * if ( x(time) >= x(start) + windowSize*limitPercent) {
     *    start += windowSize * pullBackPercent;
     *    end += windowSize * pullBackPercent;
     * }
     */
    limitPercent: 0.90,
    pullBackPercent: 0.80,

    // Price range
    priceRangeInterval: 0.1,
    priceExtentFactor: 8,



    // Callback functions
    tradeTip: function(d) {
      return d.amount+ '@' + d.price + ' by ' + d.buyUser + '/' + d.sellUser;
    },

    


    // Colours
    colour_pause: '#9f1212',
    colour_bid: '#3eb71a',
    colour_ask: '#8900bb',
    colour_trade: '#F80',
    colour_guide: '#00a7ff',
    colour_volume: '#00a7ff',
    colour_trade: '#F20020',
    colour_guide_text: '#1c6890'
  };


  // Copy over default if necessary
  config = config || {};
  Object.keys(defaultConfig).forEach(function (key) {
    if (! config.hasOwnProperty(key)) {
      config[key] = defaultConfig[key];
    }
  });


  // Wire up everything
  var svg, vis;
  var quoteGroup;
  var levelGroup;
  var tradeGroup;
  var axisGroup;
  var rightPanelGroup;
  var clippingGroup;

  // Scales
  var priceScale, dateScale;
  var dateStart, dateEnd;

  // Axis
  var yAxis;

  // Quotes
  var bidPath, bidPathTransform;
  var askPath, askPathTransform;

  var quoteBids, quoteAsks, trades, levels;


  var startTime, endTime;


  // Holds the cumulative volume at a price point
  //var levelVolume = {};
  var currentQuote = null, currentLevel = null;
  var minPrice = 9999999, maxPrice = 0;

  var windowFrameCreated = false;
  var guideTime = 0;

  var paused = false;
  var pauseTime = 0;
  var brush, lens;



  // Yikes !!
  var quoteHistory = [];
  var quoteId = 0; // Used for join computation

  var tradeHistory = [];
  var tradeId = 0; // Used for join computation

  var levelHistory = [];
  var levelId = 0; // Used forjoin computation


  // For interaction 
  var tip;
  var tradeFilter = '';
  var mouseX, mouseY;

  // Colours of the rainbow
  var d3cat20 = d3.scale.category20();


  // Dont touch
  var initialStartTime;
  var refreshPriceLevel = false;
  var brushing = false;



  ////////////////////////////////////////////////////////////////////////////////
  // API
  ////////////////////////////////////////////////////////////////////////////////
  /* Main */
  this.init = init;
  this.addDepth = addDepth;
  this.addTrade = addTrade;
  this.addQuote = addQuote;

  /* Experimental */
  this.rescalePriceRange = rescalePriceRange;
  this.rescaleDateRange = rescaleDateRange;
  this.rewind = rewind;
  this.forward = forward;
  this.preload = preload;
  this.cleanup = cleanup;

  /* Misc */
  this.guide = guide;

  this.setTradeFilter = function(s) {
    tradeFilter = s;
    repaint();
  };



  this.audit = function() {
    var elemList = [
      '.quote',
      '.trade',
      '.price-level',
      '.price-level-cell',
    ];

    elemList.forEach(function(className) {
      console.log(className, d3.selectAll(className)[0].length);
    });

    console.log('# quote data', quoteHistory.length);
    console.log('# trade data', tradeHistory.length);
    console.log('# level data', levelHistory.length);
  };


  this.togglePause = function() {
    console.log('toggle');
    paused = !paused;

    if (paused === true) {
      pauseTime = guideTime;
      d3.select('.vis-border').style('stroke-width', 2).style('stroke', config.colour_pause).style('pointer-events', 'none');
    } else {
      d3.select('.vis-border').style('stroke-width', 1).style('stroke', '#CCC').style('pointer-events', 'none');

      // Clear out magic lens
      d3.selectAll('.brush').call(brush.clear());
      lens.selectAll('.lens-info').remove();
    }
    return paused;
  };


  /**
   * For the last event
   */
  this.stop = function() {
    paused = true;
    axisGroup.select('.start-label')
      .text(_time(startTime));

    axisGroup.select('.end-label')
      .text( _time(endTime));

    guide(guideTime);

    /*
    refreshPriceLevel = true;
    repaint();
    */
  };



  ////////////////////////////////////////////////////////////////////////////////
  // Preload data sets
  // Note: can ony call this before init
  // Note: assume preload data sorted by time already
  ////////////////////////////////////////////////////////////////////////////////
  function preload(quoteEvents, tradeEvents, levelEvents) {

    var startTime = 99999999999999;
    var point;


    if (quoteHistory.length > 0 || tradeHistory.length > 0 || levelHistory.length > 0) {
      return;
    }
    if (quoteEvents.length > 0) {
      quoteHistory = [];

      for (var i=0; i< quoteEvents.length; i++) {
        var q = quoteEvents[i];
        quoteHistory.push(q);

        if (quoteEvents[i+1]) {
          var tmp = _.cloneDeep(q);
          tmp.dateTime = quoteEvents[i+1].dateTime;
          tmp.interpolated = true;
          quoteHistory.push(tmp);
        }
      }

      // quoteHistory = quoteEvents;
      currentQuote = _.last(quoteHistory);

      if (quoteHistory[0].dateTime < startTime) {
        startTime = quoteHistory[0].dateTime;
        point = quoteHistory[0];
      }

      quoteHistory.forEach(function(q) {
        q.id = ++ quoteId; 
        if (q.ask >= maxPrice) maxPrice = q.ask;
        if (q.bid <= minPrice) minPrice = q.bid;
      });

    }

    if (tradeEvents.length > 0) {
      tradeHistory = tradeEvents;

      if (tradeHistory[0].dateTime < startTime) {
        startTime = tradeHistory[0].startTime;
        point = tradeHistory[0];
      }

      tradeEvents.forEach(function(t)  {
        t.id = ++ tradeId;
      });
    
    }

    if (levelEvents.length > 0) {
      levelHistory = levelEvents; 
      currentLevel = _.last(levelHistory);

      levelHistory.forEach(function(l) {
        l.id = ++ levelId;
      });
    }

    if (point) {
      windowFrameCreated = false;
      initWindow(startTime, point);
    }



  }



  ////////////////////////////////////////////////////////////////////////////////
  // Functions
  //   init - setup SVG
  ////////////////////////////////////////////////////////////////////////////////
  function init(id) {

    // FIXME: adding some buffer room for now, need to add this into config
    svg = d3.select('#' + id).append('svg')
      .attr('width', config.svgWidth)
      .attr('height', config.svgHeight);

    vis = svg.append('g')
      .attr('transform', _translate(0, 20))
      .append('svg') // FIXME: Kind of a cheat to get clipping
      .attr('width', config.width)
      .attr('height', config.height)
      .append('g');


    // Order matters - the first group is the bottom layer, to last group is the top layer
    lens = vis.append('g')
      .classed('brush', true)
      .classed('x', true);
    levelGroup = vis.append('g');
    tradeGroup = vis.append('g');
    quoteGroup = vis.append('g');
    clippingGroup = svg.append('g');
    axisGroup = svg.append('g');
    rightPanelGroup = svg.append('g').attr('transform', _translate(config.width, 20));

    // Fake clipping for the win
    clippingGroup.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('height', 20)
      .attr('width', config.svgWidth)
      .style({
        opacity: 1,
        fill: '#FFF'
      });
    clippingGroup.append('rect')
      .attr('x', 0)
      .attr('y', 20 + config.height)
      .attr('height', 200)
      .attr('width', config.svgWidth)
      .style({
        opacity: 1,
        fill: '#FFF'
      });


    // Just a border
    vis.append('rect')
      .classed('vis-border', true)
      .attr({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height
      })
      .style('fill', 'none')
      .style('stroke', '#CCC')
      .style('pointer-events', 'none');


    axisGroup.append('text')
      .attr('class', 'start-label')
      .attr('x', 0)
      .attr('y', config.height+40);

    axisGroup.append('text')
      .attr('class', 'end-label')
      .attr('x', config.width)
      .attr('y', config.height+40)
      .style('text-anchor', 'end');


    quoteAsks = quoteGroup.selectAll('.quote-ask');
    quoteBids = quoteGroup.selectAll('.quote-bid');
    trades = tradeGroup.selectAll('.trade');
    levels = levelGroup.selectAll('.price-level');


    brush = d3.svg.brush()
      .x(d3.scale.linear().range( [0, config.width]))
      .on('brush', brushed);



    lens.call(brush)
      .selectAll('rect')
      .attr('y', 0)
      .attr('height', config.height);


    tip = d3.tip().attr('class', 'd3-tip')
      .html(function(d) { return d; });

    vis.call(tip);


   if (config.crosshairs) {
    vis.on('mousemove', function(d) {
      var p = d3.mouse(this);
      vis.selectAll('.crosshair').remove();

      if (brushing === true) return;

      vis.append('path')
        .classed('crosshair', true)
        .attr('d', _line(p[0]+2, 0, p[0]+2, config.height))
        .style('pointer-events', 'none');

      vis.append('path')
        .classed('crosshair', true)
        .attr('d', _line(0, p[1], config.width, p[1]))
        .style('stroke', '#00c')
        .style('pointer-events', 'none');

      vis.append('text')
        .classed('crosshair', true)
        .attr('x', p[0]+3)
        .attr('y', p[1]-3)
        .style('pointer-events', 'none')
        .text( dateScale ? _time(dateScale.invert(p[0])) : "");
    });
   }
  }



  function initWindow(start, data) {
    if (windowFrameCreated === true) return;
    windowFrameCreated = true;


    if (data.type === 'QUOTE') {
       rescalePriceRange(
         (+data.bid)-config.priceRangeInterval*config.priceExtentFactor,
         (+data.ask)+config.priceRangeInterval*config.priceExtentFactor, 
         false
       );
    } else if (data.type === 'TRADE') {
       rescalePriceRange(
         +data.price-config.priceRangeInterval*config.priceExtentFactor,
         +data.price+config.priceRangeInterval*config.priceExtentFactor, 
         false
       );

    }


    startTime = start;
    initialStartTime = startTime;
    endTime = start + config.windowSize;

    // Double the scale so things can overflow
    dateScale = d3.scale.linear()
      .domain([startTime, startTime + 2*config.windowSize])
      .range( [0, config.width * 2 ] );

    axisGroup.select('.start-label')
      .text( _time(startTime));
    axisGroup.select('.end-label')
      .text( _time(endTime));

    // Init svg paths
    initPath();

    // Debugging
    vis.append('path')
      .attr('d', _line( dateScale(startTime + config.windowSize*0.25), 0, dateScale(startTime + config.windowSize*0.25), config.height))
      .style('stroke', '#ccc');

    vis.append('path')
      .attr('d', _line( dateScale(startTime + config.windowSize*0.5), 0, dateScale(startTime + config.windowSize*0.5), config.height))
      .style('stroke', '#ccc');

    vis.append('path')
      .attr('d', _line( dateScale(startTime + config.windowSize*0.75), 0, dateScale(startTime + config.windowSize*0.75), config.height))
      .style('stroke', '#ccc');
  }


  function initPath() {
    bidPathTransform = d3.svg.line()
        .x(function(d, i) { return dateScale(d.dateTime); })
        .y(function(d, i) { return priceScale(d.bid); });

    askPathTransform = d3.svg.line()
        .x(function(d, i) { return dateScale(d.dateTime); })
        .y(function(d, i) { return priceScale(d.ask); });

    bidPath = quoteGroup.append('path').classed('bid-path', true).classed('line', true)
      .datum([])
      .style('stroke', config.colour_bid);
    askPath = quoteGroup.append('path').classed('ask-path', true).classed('line', true)
      .datum([])
      .style('stroke', config.colour_ask);
  }


  /**
   * Clean up - remove data points that are far behind, depending on the
   * interpretation of "far"
   *
   * - Aye, this business of how long we try, to stay alive.
   *   Why, to be here you first got to die so I gave it a try.
   *   And what do you know...time was so long ago.
   */
  function cleanup(stamp) {

    var c = _.remove(tradeHistory, function(t) {
      return t.dateTime <= stamp;
    });
    _.remove(quoteHistory, function(q) {
      return q.dateTime <= stamp;
    });
    _.remove(levelHistory, function(l) {
      return l.dateTime <= stamp;
    });

  }



  function repaint() {
    var h = Math.abs(priceScale(config.priceRangeInterval) - priceScale(0));
    var h2 = 0.5 * h;

    renderDepth(true);
    renderQuotes();
    renderTrades();

    axisGroup.select('.start-label')
      .text(_time(startTime));

    axisGroup.select('.end-label')
      .text( _time(endTime));

    guide(guideTime);
  }


  function rewind(millis) {
    startTime -= millis;

    if (startTime <= initialStartTime) {
      startTime += Math.abs(initialStartTime - startTime);
    }
    endTime = startTime + config.windowSize;

    dateScale = d3.scale.linear()
      .domain([startTime, startTime + config.windowSize])
      .range( [0, config.width] );

    repaint();
  }

  function forward(millis) {
    startTime += millis;
    endTime += millis;

    dateScale = d3.scale.linear()
      .domain([startTime, startTime + 2*config.windowSize])
      .range( [0, config.width * 2 ] );

    repaint();
  }


  function rescaleDateRange(windowSize, render) {
    config.windowSize = windowSize;

    endTime = startTime + config.windowSize;

    dateScale = d3.scale.linear()
      .domain([startTime, startTime + 2*config.windowSize])
      .range( [0, config.width * 2 ] );

    if (render == false) return;
    repaint();
  }


  // FIXME: Scaling transform is probably much better
  function rescalePriceRange(min, max, render) {
    priceScale = d3.scale.linear().domain([min, max]).range([config.height, 0]);
    yAxis = d3.svg.axis().scale(priceScale).orient('right').ticks(5);
    yAxis.orient('left');
    axisGroup.selectAll('.y-axis').remove();
    axisGroup.append('g').classed('axis', true).classed('y-axis', true).attr('transform', _translate(config.width, 20)).call(yAxis);

    if (render == false) return;

    refreshPriceLevel = true;
    repaint();

  }




  ////////////////////////////////////////////////////////////////////////////////
  // Shift current window
  //
  // - These things go slowly by,
  //   these things...
  //   They will be where no one would think
  ////////////////////////////////////////////////////////////////////////////////
  function shift(t) {

    var limit = startTime + config.windowSize*config.limitPercent;
    var offset = startTime + config.windowSize*config.pullBackPercent;

    if (t < limit) return;

    // Reconfigure
    startTime += config.windowSize*config.pullBackPercent;
    endTime += config.windowSize*config.pullBackPercent;

    dateScale = d3.scale.linear()
      .domain([startTime, startTime + 2*config.windowSize])
      .range( [0, config.width * 2 ] );


    // Delete data for Bob
    cleanup(startTime - config.keepAliveTime);


    repaint();
  }


  function renderDepth( doUpdate ) {
    if (!priceScale) {
       return
    }

    var h = Math.abs(priceScale(config.priceRangeInterval) - priceScale(0));
    var h2 = 0.5 * h;
    var max = 0;

    _.forEach(currentLevel.priceLevels, function(v, k) {
      if (v > max) max = v;
    });


    levelGroup.selectAll('.price-level-projection').remove();
    rightPanelGroup.selectAll('.price-level-accumulation').remove();

    // Projection
    if (currentLevel.dateTime < endTime) {
      _.forEach(currentLevel.priceLevels, function(v, k) {
        levelGroup.append('rect')
          .classed('price-level-projection', true)
          .datum({
            price: k,
            start: currentLevel.dateTime,
            end: endTime
          })
          .attr('x', dateScale(currentLevel.dateTime))
          .attr('y', priceScale(k) - h2)
          .attr('width', dateScale(endTime) - dateScale(currentLevel.dateTime))
          .attr('height', h)
          .style('fill', _levelColour(v, max))
          .style('fill-opacity', 0.1);
      });
    }

    // Accumulation
    var volumeScale = d3.scale.linear().domain([0, max]).range([0, 100]);
    _.forEach(currentLevel.priceLevels, function(v, k) {
      rightPanelGroup.append('rect')
        .classed('price-level-accumulation', true)
        .datum({
          price: k,
          start: currentLevel.dateTime,
          end: currentLevel.endTime
        })
        .attr('x', 0)
        .attr('y', priceScale(k) - h2+1)
        .attr('width', volumeScale(v))
        .attr('height', h-1)
        .style('fill', function(){
          if (currentQuote) {
            if (+k < (+currentQuote.ask).toFixed(1) ) {
              return config.colour_bid;
            }
            return config.colour_ask;
          }
          return config.colour_volume;
        })
        .style('fill-opacity', 0.20);
    });




    var levelList2 = _.filter(levelHistory, function(q) {
      if (! paused) {
        return q.dateTime >= startTime - config.windowSize*0.25 && q.dateTime <= endTime + config.windowSize*0.25;
      } {
        return q.dateTime >= startTime - config.windowSize*0.25 && q.dateTime <= pauseTime;
      }
    });
    var levelList = _.filter(levelList2, function(d) {
      return d.hasOwnProperty('endTime');
    });

    levels = levels.data(levelList, function(d) {
      return d.id;
    });

    levels.enter()
      .append('g')
      .classed('price-level', true)
      .each(function(d) {
        var max = 0, levelArray = [];
        _.forEach(d.priceLevels, function(v, k) {
          if (v > max) max = v;
          levelArray.push({
            volume: v,
            price: k
          });
        });

        d3.select(this)
          .selectAll('.price-level-cell')
          .data(levelArray)
          .enter()
          .append('rect')
          .classed('price-level-cell', true)
          .attr('x', dateScale(d.dateTime))
          .attr('y', function(d) {
            return priceScale(d.price) - h2;
          })
          .attr('width', dateScale(d.endTime) - dateScale(d.dateTime))
          .attr('height', h)
          .style('fill', function(d) {
            return _levelColour(d.volume, max);
          })
          .style('pointer-events', 'none')
          .style('fill-opacity', 0.1);

      });

    // Optimization check
    if (doUpdate === true) {
      levels.each(function(d) {
        d3.select(this)
          .selectAll('.price-level-cell')
          .attr('x', dateScale(d.dateTime))
          .attr('y', function(d) {
            return priceScale(d.price) - h2;
          })
          .attr('width', dateScale(d.endTime) - dateScale(d.dateTime))
          .attr('height', h)
          .style('fill', function(d) {
            return _levelColour(d.volume, max);
          })
          .style('fill-opacity', 0.1);

      });
    }
    levels.exit().remove();
  }



  function addDepth(data) {

    // End last interval
    var len = levelHistory.length;
    if (len > 0) {
      levelHistory[len-1].endTime = data.dateTime;
    }

    data.id = ++levelId;
    levelHistory.push(data);

    if (paused === true) return;

    // Prevent quirky out of order events
    if (! currentLevel || data.dateTime >= currentLevel.dateTime) {
      currentLevel = data;
    }


    renderDepth(refreshPriceLevel);
    refreshPriceLevel = false;
  };



  function renderTrades() {
    var tradeList = _.filter(tradeHistory, function(q) {
      if (! paused) {
        return q.dateTime >= startTime - config.windowSize*0.25 && q.dateTime <= endTime + config.windowSize*0.25;
      } else {
        return q.dateTime >= startTime - config.windowSize*0.25 && q.dateTime <= pauseTime;
      }
    });

    function radius(d) {
      return 0.002 * d.amount;
    }


    trades = trades.data(tradeList, function(d) { return d.id; });

    trades.enter()
      .append('circle')
      .classed('trade', true)
      .attr('cx', function(d) { return dateScale(d.dateTime); })
      .attr('cy', function(d) { return priceScale(d.price); })
      .attr('r', radius)
      .style('fill-opacity', 0.15)
      .style('fill', config.colour_trade)
      .on('mouseover', function(d) {
        tip.show(config.tradeTip(d));
      })
      .on('mouseout', function(d) {
        tip.hide();
      });

    trades
      .classed('trade', true)
      .attr('cx', function(d) { return dateScale(d.dateTime); })
      .attr('cy', function(d) { return priceScale(d.price); })
      .attr('r', radius)
      .style('fill-opacity', 0.15)
      .style('fill', config.colour_trade);
    trades.exit().remove();

    if (tradeFilter !== '') {
      var t2 = _.filter(tradeList, function(d) {
        return d.buyUser === tradeFilter || d.sellUser === tradeFilter;
      });
      if (t2.length === 0) return;
      trades = trades.data(t2);
      trades.exit().style('opacity', 0);
    }
  }


  function addTrade(data) {

    data.id = ++ tradeId;
    tradeHistory.push(data);
    if (paused === true) return;
    initWindow(data.dateTime, data);

    renderTrades();
  };


  function addQuote(data) {



    // Bob wants "constant" interpolation, fetch previous quote and extend until current cursor
    if (_.last(quoteHistory)) {
      var prevQuote = _.cloneDeep(_.last(quoteHistory));
      prevQuote.dateTime = data.dateTime;
      prevQuote.interpolated = true;
      prevQuote.id = ++quoteId;
      quoteHistory.push(prevQuote);
    }
    data.id = ++quoteId;
    quoteHistory.push(data);

    if (paused === true) return;

    initWindow(data.dateTime, data);

    // Prevent quirky out of order events
    if (! currentQuote || data.dateTime > currentQuote.dateTime) {
      currentQuote = data;
    }

    
    var changed = false;
    if (+currentQuote.bid <= minPrice) {
      minPrice = +currentQuote.bid;
      changed = true;
    }
    if (+currentQuote.ask >= maxPrice) {
      maxPrice = +currentQuote.ask;
      changed = true;
    }

    if (changed) {
      rescalePriceRange(
        minPrice-config.priceRangeInterval*config.priceExtentFactor,
        maxPrice+config.priceRangeInterval*config.priceExtentFactor, 
        false
      );
      refreshPriceLevel = true;
    }



    renderQuotes();
    shift(data.dateTime);
    // cleanup();
  }



  function renderQuotes() {

    // Projection
    quoteGroup.selectAll('.quote-projection').remove();
    quoteGroup.append('path')
      .classed('quote-projection', true)
      .attr('d', _line( dateScale(currentQuote.dateTime), priceScale(currentQuote.ask), dateScale(endTime), priceScale(currentQuote.ask)))
      .style('stroke-dasharray', '5, 5')
      .style('stroke', config.colour_ask);

    quoteGroup.append('path')
      .classed('quote-projection', true)
      .attr('d', _line( dateScale(currentQuote.dateTime), priceScale(currentQuote.bid), dateScale(endTime), priceScale(currentQuote.bid)))
      .style('stroke-dasharray', '5, 5')
      .style('stroke', config.colour_bid);


    var quotePathList = _.filter(quoteHistory, function(q) {
      if (! paused) {
        return q.dateTime >= startTime - config.windowSize*0.25 && q.dateTime <= endTime + config.windowSize*0.25;
      } {
        return q.dateTime >= startTime - config.windowSize*0.25 && q.dateTime <= pauseTime;
      }
    });


    // Sort to make sure path isn't weird
    quotePathList = _.sortBy(quotePathList, function(q) {
      return q.dateTime;
    });


    bidPath.data([quotePathList]);
    askPath.data([quotePathList]);
    bidPath.attr('d', bidPathTransform).attr('transform', null);
    askPath.attr('d', askPathTransform).attr('transform', null);


    var quoteList = _.filter(quotePathList, function(q) {
      return !q.hasOwnProperty('interpolated');
    });

    quoteAsks = quoteAsks.data(quoteList, function(d) {
      return d.id;
    });

    quoteBids = quoteBids.data(quoteList, function(d) {
      return d.id;
    });

    quoteAsks.enter()
      .append('circle')
      .classed('quote', true)
      .classed('quote-ask', true)
      .attr('cx', function(d) { return dateScale(d.dateTime); })
      .attr('cy', function(d) { return priceScale(d.ask); })
      .attr('r', 3)
      .style('fill', config.colour_ask)
      .style('fill-opacity', 0.5);

    quoteAsks
      .classed('quote', true)
      .classed('quote-ask', true)
      .attr('cx', function(d) { return dateScale(d.dateTime); })
      .attr('cy', function(d) { return priceScale(d.ask); })
      .attr('r', 3)
      .style('fill', config.colour_ask)
      .style('fill-opacity', 0.5);
    quoteAsks.exit().remove();

    quoteBids.enter()
      .append('circle')
      .classed('quote', true)
      .classed('quote-bid', true)
      .attr('cx', function(d) { return dateScale(d.dateTime); })
      .attr('cy', function(d) { return priceScale(d.bid); })
      .attr('r', 3)
      .style('fill', config.colour_bid)
      .style('fill-opacity', 0.5);
    quoteBids
      .classed('quote', true)
      .classed('quote-bid', true)
      .attr('cx', function(d) { return dateScale(d.dateTime); })
      .attr('cy', function(d) { return priceScale(d.bid); })
      .attr('r', 3)
      .style('fill', config.colour_bid)
      .style('fill-opacity', 0.5);
    quoteBids.exit().remove();
  }




  /**
   * Show the current "real" time
   *
   * - That's one line I stay right behind ...
   */
  function guide(time) {

    if (paused) {
      d3.select('.guide').style('fill', config.colour_pause).style('fill-opacity', 1.0);
      return;
    }


    if (time >= guideTime) guideTime = time;

    svg.selectAll('.guide').remove();

    // Prevent errors when rewinding beyond the scaling capability
    if (time >= endTime || guideTime >= endTime) return;

    svg.append('rect')
      .attr('class', 'guide')
      .attr('x', dateScale(time) - 2.5)
      .attr('y', 20)
      .attr('width', 5)
      .attr('height', config.height)
      .style('stroke', 'none')
      .style('fill', config.colour_guide)
      .style('fill-opacity', '0.2');

    svg.append('text')
      .attr('class', 'guide')
      .attr('x', dateScale(time))
      .attr('y', config.height+42)
      .style('text-anchor', 'middle')
      .style('fill', config.colour_guide_text)
      .style('stroke-width', '0.5px')
      .text(_time(time));
  };


  // My cell of space that holds me
  function brushed() {
    if (! paused) { 
      d3.selectAll('.brush').call(brush.clear());
      lens.selectAll('.lens-info').remove();
      return;
    }
    lens.selectAll('.lens-info').remove();

    var lensStart = dateScale.invert(config.width*brush.extent()[0]);
    var lensEnd = dateScale.invert(config.width*brush.extent()[1]);

    if (Math.abs(lensStart - lensEnd) <= 1) {
      brushing = false;
    } else {
      brushing = true;
    }

    // Just to make sure the lens doesn't kick of with random clicks
    if (Math.abs(lensStart - lensEnd) <= 5) return;


    if (lensEnd >= pauseTime || lensStart >= pauseTime) return;

    var lensQuotes = _.filter(quoteHistory, function(q) {
      return q.dateTime >= lensStart && q.dateTime <= lensEnd;
    });
    var lensTrades= _.filter(tradeHistory, function(q) {
      return q.dateTime >= lensStart && q.dateTime <= lensEnd;
    });


    lens.append('text')
      .classed('lens-info', true)
      .attr('x', dateScale(lensStart) + 10)
      .attr('y', 30)
      .style('fill', '#25b')
      .text(_time(lensStart) + ' - ' + _time(lensEnd));

    lens.append('text')
      .classed('lens-info', true)
      .attr('x', dateScale(lensStart) + 10)
      .attr('y', 50)
      .text('Number of quotes:' + lensQuotes.length);

    lens.append('text')
      .classed('lens-info', true)
      .attr('x', dateScale(lensStart) + 10)
      .attr('y', 70)
      .text('Number of trades: ' + lensTrades.length);

    // Zoom
    // zoomLens(lensQuotes, lensTrades);

    // Traders
    traderLens(lensTrades);
  }

  function traderLens(lensTrades) {
    var lensStart = dateScale.invert(config.width*brush.extent()[0]);
    var lensEnd = dateScale.invert(config.width*brush.extent()[1]);
    var buyers = _.unique(_.pluck(lensTrades, 'buyUser')); 
    var sellers = _.unique(_.pluck(lensTrades, 'sellUser')); 

    var activeBuyer = _.sortBy(_.groupBy(lensTrades, 'buyUser'), function(v, k) {
      return -v.length;
    })[0];

    var activeSeller = _.sortBy(_.groupBy(lensTrades, 'sellUser'), function(v, k) {
      return -v.length;
    })[0];


    lens.append('text')
      .classed('lens-info', true)
      .attr('x', dateScale(lensStart) + 10)
      .attr('y', 90)
      .text('Number of buyers: ' + buyers.length);

    lens.append('text')
      .classed('lens-info', true)
      .attr('x', dateScale(lensStart) + 10)
      .attr('y', 110)
      .text('Number of sellers: ' + sellers.length);

    if (activeBuyer) {
       lens.append('text')
         .classed('lens-info', true)
         .attr('x', dateScale(lensStart) + 10)
         .attr('y', 130)
         .text('Most active buyer: ' + activeBuyer[0].buyUser + ' - ' + activeBuyer.length + ' trades');
    }
     
    if (activeSeller) {
       lens.append('text')
         .classed('lens-info', true)
         .attr('x', dateScale(lensStart) + 10)
         .attr('y', 150)
         .text('Most active seller: ' + activeSeller[0].sellUser + ' - ' + activeSeller.length + ' trades');
    }


  }


  function zoomLens(lensQuotes, lensTrades) {
    var zmin = d3.min(_.pluck(lensQuotes, 'bid').map(function(d) { return +d; }));
    var zmax = d3.max(_.pluck(lensQuotes, 'ask').map(function(d) { return +d; }));
    var zoom = lens.append('g').classed('lens-info', true);

    var zoomScale = d3.scale.linear().domain([+zmin-0.05, +zmax+0.05]).range([config.height-50, 150]);
    var zoomBidTransform = d3.svg.line()
        .x(function(d, i) { return dateScale(d.dateTime); })
        .y(function(d, i) { return zoomScale(d.bid); });
    var zoomAskTransform = d3.svg.line()
        .x(function(d, i) { return dateScale(d.dateTime); })
        .y(function(d, i) { return zoomScale(d.ask); });
    
    var zoomBackdrop = zoom.append('rect')
      .attr('x', config.width*brush.extent()[0])
      .attr('y', 120)
      .attr('width', config.width*brush.extent()[1] - config.width*brush.extent()[0])
      .attr('height', 260)
      .style('fill-opacity', 0.6)
      .style('fill', '#FDFDFD')
      .style('pointer-events', 'none');


    var zoomBid = zoom.append('path')
      .classed('bid-path', true)
      .classed('line', true)
      .data([lensQuotes])
      .attr('d', zoomBidTransform)
      .style('stroke', config.colour_bid)
      .style('stroke-width', 3);

    var zoomAsk = zoom.append('path')
      .classed('ask-path', true)
      .classed('line', true)
      .data([lensQuotes])
      .attr('d', zoomAskTransform)
      .style('stroke', config.colour_ask)
      .style('stroke-width', 3);

  }
  


  /* One more of me */
  this.debug = function() {
    svg.append('g')
      .append('circle')
      .attr({
        cx: config.width * 0.5,
        cy: config.height * 0.5,
        r: 40
      })
      .style('fill', 'red');
  };


};





