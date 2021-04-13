import * as requestBodies from "../components/requestBodies";
import {
  Operation,
  HttpRequestAdapter,
  ApiError,
  ApiResponse,
  request,
} from "openapi-io-ts/dist/runtime";
import { TaskEither } from "fp-ts/TaskEither";

export const updatePetOperation: Operation = {
  path: "/pet",
  method: "put",
  responses: {
    "400": { _tag: "EmptyResponse" },
    "404": { _tag: "EmptyResponse" },
    "405": { _tag: "EmptyResponse" },
  },
  parameters: [],
  requestDefaultHeaders: {},
  body: requestBodies.Pet,
};

export const updatePet = (requestAdapter: HttpRequestAdapter) => (
  body: requestBodies.PetSchema
): TaskEither<ApiError, ApiResponse<void>> =>
  request(updatePetOperation, {}, body, requestAdapter);
