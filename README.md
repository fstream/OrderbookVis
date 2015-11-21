# OrderbookVis
An order book data simulator/visualization built using with D3. The application simulates near real time quotes and trades data stream which are then captured in the visualization. OrderbookVis is composed of two parts:

- A customizable visualization and data processing library.
- A simulator and demo application.

Features include:

- Bid, Ask, Trade, and Price-level visualizations
- Magic lens for analysis and specialized queries
- Pause, forward and rewind the time dimension
- Scale to different sized time (x-axis) windows
- Scale to different price (y-axis) windows

![Orderbook1](http://mwdchang.github.io/images/orderbook1.png "Sample order book")


## Dependencies
OrderbookVis depends on `NodeJS`, `npm` and `bower`.


## Setup and run the simulator
Install build and runtime dependencies
- `npm install`
- `bower install`

Build and start OrderbookVis
- `grunt server`
- Goto `http://localhost:9000/simulator.html`
