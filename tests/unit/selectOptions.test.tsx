import { describe, expect, it } from "vitest";
import { Fragment } from "react";
import { optionsFrom } from "../../components/workspace/selectOptions";

describe("select option conversion", () => {
  it("unwraps nested fragments and keeps explicit values, labels and disabled flags", () => {
    const options = optionsFrom(<Fragment><option value="a">Alpha</option><Fragment><option value="b" disabled>Beta</option></Fragment></Fragment>);
    expect(options).toEqual([{ value: "a", label: "Alpha", disabled: undefined }, { value: "b", label: "Beta", disabled: true }]);
  });
  it("uses child text for missing values and ignores other elements", () => {
    expect(optionsFrom(<><option>Fallback</option><div>Not a choice</div></>)).toEqual([{ value: "Fallback", label: "Fallback", disabled: undefined }]);
  });
});
