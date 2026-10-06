import { installFiberCensus } from "../lib/fiberCensus";

// Before react-dom loads, so React registers with the census as it would with DevTools.
installFiberCensus();
