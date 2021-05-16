# openapi-io-ts

`openapi-io-ts` is a code generation tool capable of generating [io-ts](https://github.com/gcanti/io-ts) decoders from an [OpenAPI](https://www.openapis.org/) document. It can also generate the code needed to perform the request and decode/parse the response returned by the server.

It is composed of a CLI for code generation and a runtime used to perform the request and decode the response.

## Project status

**WARNING** The project is still an alpha version. The generation of the decoders is working (apart from some edge cases like recursive decoders), but the API of the runtime can be changed in future versions with breaking changes.

## CLI

### Installation

You can install `@openapi-io-ts/cli` as a `devDependency`:

```bash
# npm
npm i -D @openapi-io-ts/cli

# yarn
yarn add -D @openapi-io-ts/cli
```

### Usage

You can launch the `openapi-io-ts` binary by adding a script to the `package.json`.

```json
{
  "scripts": {
    "generate-api": "openapi-io-ts -i petstore.yaml -o src/api"
  }
}
```

```bash
# npm
npm run generate-api

# yarn
yarn generate-api
```

The `-i` parameter is used to pass an OpenAPI document, and the `-o` parameter is the output directory.

**Note**: At the moment the only OpenAPI version supported is `3.0`. If you have a `2.0` file you have to convert it to `3.0` before. Version `3.1` is not supported at the moment.

**Note**: Each operation defined in the `paths` section of the OpenAPI document must have an `operationId`.

### Generated code

The code generated by the CLI contains the `io-ts` decoders for the schemas that are defined in the OpenAPI document and other objects that are used by the runtime.

The folder structure of the generated code is similar to the structure of the OpenAPI document, with a `components` folder that contains common objects, and an `operations` folder containing the various operations.

You can see an example in the [examples/react-query-petstore/src/api](examples/react-query-petstore/src/api) folder.

**Note**: The generated code is formatted using the default TypeScript formatter. If you want to format it with another tool like Prettier you can run it after the code generation:

```json
{
  "scripts": {
    "generate": "openapi-io-ts -i petstore.yaml -o src/api && prettier --write ./src/api"
  }
}
```

## Generated client

The CLI will generate code for performing requests defined in the OpenAPI document and decode the returned response. For using the generated code you will need to install the runtime, that is a package that contains functions for preparing the request and decoding the response

### Installation

You can install `@openapi-io-ts/runtime` as a dependency of your project:

```bash
# npm
npm i @openapi-io-ts/runtime

# yarn
yarn add @openapi-io-ts/runtime
```

The runtime has `fp-ts`, `io-ts`, and `io-ts-types` as peer dependencies, so you have to install them as well if they are not already installed in your project:

```bash
# npm
npm i fp-ts io-ts io-ts-types

# yarn
yarn add fp-ts io-ts io-ts-types
```

### Generated request functions

For each operation described in the OpenAPI document, the code generator will generate a function for calling the API and decoding the result.
The return type of the function is `TaskEither<ApiError, ApiResponse<T>>`, where `T` is the type returned by the API on a successful response.

When the `TaskEither` is executed, the API will be called and the result returned in the promise will be either a `Right` containing the response or a `Left` containing an error.

The result is `Right` when the API returns a successful HTTP code and the decoding of the returned value succeeds. The `ApiResponse` object will contain the decoded data and a `Response` object that can be useful for example for reading response headers.

Otherwise, the result will be a `Left`. The `ApiError` is a tagged union with one of these types:

- `RequestError` when the function using for calling the API threw an exception
- `HttpError` when the response HTTP code is not a `2XX` code
- `DecodeError` when the decoding of the response failed
- `ContentParseError` when there was an error during the parse of the returned JSON.

### HttpRequestAdapter

The sequence of operation for calling an API are:

1. Preparing the request: replacing path parameters, encoding query parameters in the query string, creating headers, encoding the body
2. Performing the request using an HTTP client
3. Parsing the response and returning either an `ApiError` or an `ApiResponse`.

The code generated uses the runtime for steps 1 and 3, and requires a function supplied by the user for step 2. This function takes in input an URL and a `RequestInit` object created by the first step and returns a promise containing a `Response` object used by the following step:

```ts
type HttpRequestAdapter = (url: string, req: RequestInit) => Promise<Response>;
```

The URL passed to the function is a relative URL, and you need to add the base URL. In your function, you can also modify the `RequestInit` object, for example adding authorization headers.

As you can see, the API is identical to the `fetch` API. In fact, the easiest way to define the `HttpRequestAdapter` is using the `fetch` API:

```ts
const fetchRequestAdapter: HttpRequestAdapter = (url, init) =>
  fetch(`http://example.com/api${url}`, init);
```

You can also use a different HTTP client, but you need to convert the `RequestInit` to the request object used by the client and create a `Response` object from the response returned by the client. Like `fetch`, the promise should be always resolved with any HTTP code. Keep also in mind that since `Request` and `Response` are part of the `fetch` API, you should polyfill them if fetch is not available in your execution environment.

### Using the request functions

The CLI will generate a request function for each operation defined in the OpenAPI document. There is a function builder that accepts an `HttpRequestAdapter` and returns the actual request function. For convenience, the client will also generate a service builder for each tag defined in the OpenAPI document. This service builder takes an `HttpRequestAdapter` as a parameter and returns an object containing all of the request functions for that tag.

For example, if your OpenAPI document contains a `updateUser` operation that takes a `username` as a path parameter, a `User` object in the body, and returns an `User` on success, the request function builder will have this signature:

```ts
export type UpdateUserRequestParameters = {
  username: string;
};

export const updateUserBuilder = (requestAdapter: HttpRequestAdapter) => (
  params: UpdateUserRequestParameters,
  body: schemas.User
): TaskEither<ApiError, ApiResponse<schemas.User>>
```

You can use it passing your defined `HttpRequestAdapter`:

```ts
const updateUser = updateUserBuilder(fetchRequestAdapter);

updateUser(
  { username: "johndoe" },
  { email: "john.doe@example.com" }
)().then(/*...*/);
```

If this operation has a tag called user you can also use the generated `userServiceBuilder`

```ts
const userService = userServiceBuilder(fetchRequestAdapter);

userService
  .updateUser({ username: "johndoe" }, { email: "john.doe@example.com" })()
  .then(/*...*/);
```

You can see more examples in the [examples/react-query-petstore/src/api](examples/react-query-petstore/src/api) folder.

As described above, the type returned by the generated request functions is a `TaskEither`, which represents an asynchronous computation that can fail with an `ApiError` or succeeds with an `ApiResponse`.

If you want to run the asynchronous computation you can call the `()` method of the `TaskEither` and then distinguish between successful and unsuccessful responses using the `fold` method of the `Either` data type.

```ts
import * as E from "fp-ts/Either";

updateUser({ username: "johndoe" }, { email: "john.doe@example.com" })().then(
  E.fold(
    (e) => {
      /* e is an ApiError */
    },
    (res) => {
      /* res.data is schemas.User, res.response is the Response object */
    }
  )
);
```

## License

[MIT](https://choosealicense.com/licenses/mit/)
