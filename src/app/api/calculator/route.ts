import { z } from "zod";
import { handle, body } from "@/lib/backend/http";
import { readContent } from "@/lib/backend/service";
import {
  ChartSchema,
  estimateFabric,
  CALCULATOR_DISCLAIMER,
} from "@/lib/backend/domain";
export async function POST(request: Request) {
  return handle(async () => {
    const input = z
      .object({
        garment: z.string().max(100),
        size: z.string().max(100),
        widthCm: z.number().positive().max(1000),
      })
      .strict()
      .parse(await body(request));
    const data = (await readContent("calculator"))[0]?.data;
    return {
      ...(data
        ? estimateFabric(input, ChartSchema.parse(data))
        : { reason: "NOT_APPROVED" }),
      disclaimer: CALCULATOR_DISCLAIMER,
    };
  });
}
