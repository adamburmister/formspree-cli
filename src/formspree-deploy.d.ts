// @formspree/deploy ships no types. It's a CommonJS module, so it's
// imported by its default export.
declare module '@formspree/deploy' {
  /** A deployment's result, as the API reports it. */
  export interface DeployResponse {
    status: number;
    data: {
      id?: string;
      log?: string[];
      code?: string;
      errors?: { field?: string; message: string }[];
    };
  }

  const deploy: {
    /** The config given with --config, else the config file's contents. */
    getRawConfig(args: {
      config?: string | undefined;
      file?: string | undefined;
    }): string | null;

    /** The deploy key given with --key, else $FORMSPREE_DEPLOY_KEY. */
    getDeployKey(args: { key?: string | undefined }): string | undefined;

    request(args: {
      endpoint?: string;
      config: unknown;
      force?: boolean | undefined;
      key: string;
      userAgent: string;
    }): Promise<DeployResponse>;
  };

  export default deploy;
}
