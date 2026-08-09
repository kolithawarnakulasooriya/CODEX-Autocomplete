interface User {
  id: number;
  name: string;
}

export function namesById(users: User[]): Map<number, string> {
  return users.reduce((result, user) => {
    // Put the cursor after “result.” and trigger Autocomplete Codex.
    result.
    return result;
  }, new Map<number, string>());
}
