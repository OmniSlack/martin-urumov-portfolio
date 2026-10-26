export interface AsyncClosable {
  end(): Promise<void>;
}

export async function usingAsyncResource<Resource extends AsyncClosable, Result>(
  create: () => Resource,
  use: (resource: Resource) => Promise<Result>,
): Promise<Result> {
  const resource = create();
  try {
    return await use(resource);
  } finally {
    await resource.end();
  }
}
