import { assertEquals } from "@std/assert";
import faxios, { FaxiosError, FaxiosHeaders, CanceledError } from "faxios";

Deno.test("Deno importing: default export is callable", () => {
  assertEquals(typeof axios, "function");
});

Deno.test("Deno importing: named exports are functions", () => {
  assertEquals(typeof FaxiosError, "function");
  assertEquals(typeof CanceledError, "function");
  assertEquals(typeof FaxiosHeaders, "function");
});

Deno.test("Deno importing: named exports match axios properties", () => {
  assertEquals(faxios.FaxiosError, FaxiosError);
  assertEquals(faxios.CanceledError, CanceledError);
  assertEquals(faxios.FaxiosHeaders, FaxiosHeaders);
});
