
import { Router } from "express";

import type { Account } from "../db/schema.js";
import { consumeUnits } from "../services/consume.js";
import { isPositiveInt } from "../validation.js";

export const consumeRouter = Router();

consumeRouter.post("/", async (req, res) => {
  const account: Account = res.locals.account;

  const { externalId, requestId, units } = req.body ?? {};

  // Check that the user ID is valid.
  if (
    typeof externalId !== "string" ||
    externalId.trim() === ""
  ) {
    res.status(400).json({
      error: "externalId is required",
    });
    return;
  }

  // Check that the request ID is valid.
  if (
    typeof requestId !== "string" ||
    requestId.trim() === ""
  ) {
    res.status(400).json({
      error: "requestId is required",
    });
    return;
  }

  // Units must be a positive whole number.
  if (!isPositiveInt(units)) {
    res.status(400).json({
      error: "units must be a positive whole number",
    });
    return;
  }

  const result = await consumeUnits(
    account.id,
    externalId.trim(),
    requestId,
    units,
  );

  if (result.status === "user_not_found") {
    res.status(404).json({
      error: "user not found",
    });
    return;
  }

  if (result.status === "conflict") {
    res.status(409).json({
      error: "requestId already used with different details",
    });
    return;
  }

  const { status, ...response } = result;

  res.status(200).json(response);
});
