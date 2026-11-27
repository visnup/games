import Head from "next/head";
import { readme } from "kit/readme.ts";

export const getStaticProps = () => ({ props: readme() });

export default function Learn({ title, description, html }: ReturnType<typeof readme>) {
  return (
    <>
      <Head>
        <title>{`${title}: how to play well`}</title>
        <meta name="description" content={description} />
      </Head>
      <main className="learn" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
