import { MockDataSource } from "./mock";
import { OnchainDataSource } from "./onchain";
import type { DataSource } from "./source";

export const IS_MOCK = process.env.NEXT_PUBLIC_DATA_SOURCE !== "onchain";

const mock = IS_MOCK ? new MockDataSource() : null;

export const dataSource: DataSource = IS_MOCK ? mock! : new OnchainDataSource();

/** Demo controls; null onchain. */
export const mockControls = mock;

export type { DataSource } from "./source";
export * from "./types";
