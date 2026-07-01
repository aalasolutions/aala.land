export const fileTypeFromBuffer = jest.fn().mockResolvedValue({ mime: 'image/jpeg', ext: 'jpg' });
export const fileTypeFromFile = jest.fn().mockResolvedValue({ mime: 'application/pdf', ext: 'pdf' });
