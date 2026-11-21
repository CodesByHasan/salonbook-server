import { z } from "zod";
import { ApiError } from "../utils/ApiError.js";

export const validate =
  (schema, source = "body") =>
  (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const { fieldErrors, formErrors } = z.flattenError(result.error);
      throw new ApiError(400, "Validation failed", {
        ...fieldErrors,
        ...(formErrors.length && { _form: formErrors }),
      });
    }

    req.valid = { ...req.valid, [source]: result.data };
    next();
  };