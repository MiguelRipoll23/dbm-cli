export type Credentials = {
  username: string;
  password: string;
};

export interface SecretResolver {
  resolveCredentials(name: string, environment: string): Promise<Credentials>;
  resolvePassword(name: string, environment: string): Promise<string>;
  entryExists(name: string, environment: string): Promise<boolean>;
  storePassword(name: string, environment: string, username: string, password: string): Promise<void>;
  editEntry(name: string, environment: string, username: string, newPassword: string): Promise<void>;
  deleteEntry(name: string, environment: string): Promise<void>;
}
