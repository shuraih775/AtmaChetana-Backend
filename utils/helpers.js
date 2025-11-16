export function sanitizeBigInt(obj) {
  return JSON.parse(
    JSON.stringify(obj, (_, v) =>
      typeof v === "bigint" ? Number(v) : v
    )
  );
}

export function preprocessDate(input) {
  if (!input) {
    return { error: "requestedDate is required" };
  }

  // If it's a string, try to convert
  if (typeof input === "string") {
    const d = new Date(input);

    if (isNaN(d.getTime())) {
      return {
        error:
          "Invalid requestedDate format. Please send a valid date string (YYYY-MM-DD).",
        received: input,
      };
    }

    return { date: d };
  }

  // If it's already a Date object
  if (input instanceof Date) {
    return { date: input };
  }

  // Otherwise invalid type
  return {
    error: "Invalid requestedDate type. Must be a Date or a date string.",
    receivedType: typeof input,
  };
}
