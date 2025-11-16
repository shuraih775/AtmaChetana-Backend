
const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let message = err.message || "Server Error";

  console.error("Error:", err);


  // Unique constraint violation 
  if (err.code === "P2002") {
    statusCode = 400;
    message = `Duplicate value for field: ${err.meta?.target?.join(", ")}`;
  }

  // Record not found
  if (err.code === "P2025") {
    statusCode = 404;
    message = "Requested resource not found";
  }

  // Value too long
  if (err.code === "P2000") {
    statusCode = 400;
    message = "Input value is too long for this field";
  }

  // Null constraint failed
  if (err.code === "P2011") {
    statusCode = 400;
    message = `Missing required field: ${err.meta?.constraint}`;
  }

  // Invalid relation (foreign key failure)
  if (err.code === "P2014") {
    statusCode = 400;
    message = "Invalid relation or foreign key";
  }

  // Access denied (MySQL permissions)
  if (err.code === "P1010") {
    statusCode = 500;
    message = "Database access denied";
  }


  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired";
  }

  
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

export { errorHandler };
