import mergeWith from "lodash/mergeWith";
import { isArray } from "lodash";

const customMerge = <T>(objValue: T, srcValue: T): T | undefined => {
  if (isArray(objValue)) {
    return srcValue;
  }
  return undefined;
};

const config = mergeWith(
  {},
  buildTimeConfig,
  globalThis.__CONFIG__ || {},
  customMerge,
) as typeof buildTimeConfig;

export default config;
