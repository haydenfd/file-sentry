export interface FileInfo {
    filePath: string;
    ctime: string;
}

export type SubmitPasswordFunction = (password : string) => void;
