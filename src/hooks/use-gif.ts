import { createGif } from '@/utils/assets';
import { useQuery } from '@tanstack/react-query';

export const useGif = (images: string[], fps: number, width: number, height: number) => {
  const { data, isLoading, error } = useQuery<string>({
    queryKey: ['gif-create', ...images, fps, width, height],
    queryFn: async () => {
      const gif = await createGif(images, fps, width, height);
      return gif;
    },
  });

  return {
    data,
    isLoading,
    error,
  };
};
