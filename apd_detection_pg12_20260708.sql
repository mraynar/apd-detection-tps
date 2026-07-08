--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cameras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cameras (
    id integer NOT NULL,
    owner_user_id integer NOT NULL,
    label character varying(255) NOT NULL,
    use_rtsp boolean DEFAULT false NOT NULL,
    rtsp_url character varying(500),
    camera_index integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    source_type character varying(50) DEFAULT 'webcam'::character varying NOT NULL,
    webcam_device_id character varying(255)
);


--
-- Name: cameras_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cameras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cameras_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cameras_id_seq OWNED BY public.cameras.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    token character varying(255) NOT NULL,
    user_id integer NOT NULL,
    role character varying(50) NOT NULL,
    created_at timestamp without time zone,
    expires_at timestamp without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    created_at timestamp without time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.violations (
    id character varying(255) NOT NULL,
    "timestamp" character varying(255) NOT NULL,
    label character varying(100) NOT NULL,
    confidence double precision NOT NULL,
    camera_source character varying(255) NOT NULL,
    is_violation boolean,
    created_at timestamp without time zone
);


--
-- Name: cameras id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cameras ALTER COLUMN id SET DEFAULT nextval('public.cameras_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: cameras; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cameras (id, owner_user_id, label, use_rtsp, rtsp_url, camera_index, created_at, updated_at, source_type, webcam_device_id) FROM stdin;
3	1	Mac Cam	f	\N	\N	2026-07-08 03:41:05.550816	2026-07-08 03:41:05.55083	webcam	6B12BAF5D1A15FAF87B9575986E579D55BFA4102
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sessions (token, user_id, role, created_at, expires_at) FROM stdin;
6a07329b-2999-4ab9-af77-1bb268a034e9	1	admin	2026-07-03 09:26:57.031379	2026-07-04 09:26:57.028059
aefcd544-dd64-41d0-92d0-b56c1b515511	1	admin	2026-07-03 09:33:03.168437	2026-07-04 09:33:03.164743
d40e87b3-2a4e-40e5-89fe-3a45841d09c4	1	admin	2026-07-03 09:33:30.932691	2026-07-04 09:33:30.9316
f0c413b8-a54b-40de-a1c9-28612c951558	1	admin	2026-07-03 10:01:07.246917	2026-07-04 10:01:07.245191
39fc918a-1e2c-4d07-8d80-3529c51abe25	1	admin	2026-07-04 11:32:15.11791	2026-07-05 11:32:15.117763
67ec0e7f-2e0d-4728-9c51-ae06d3718a82	1	admin	2026-07-05 23:49:21.440661	2026-07-06 23:49:21.438706
36d43e70-2055-4aa1-a0f1-0f4e1db53366	1	admin	2026-07-07 03:35:59.604767	2026-07-08 03:35:59.601369
1deba121-24e0-4f67-bee6-9f55649e7219	1	admin	2026-07-08 03:37:43.706078	2026-07-09 03:37:43.703548
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, password_hash, role, created_at) FROM stdin;
1	admin	$2b$12$g87EDFOgfTCrlroVOW3neeaC.Ifj7ZoBYt7dsLWKlNZ.Ietb7rLuq	admin	2026-07-03 07:30:21.832235
2	user1	$2b$12$P/OtrSYNWjYt6PrlKZzby.96mp3aUpNo.yOI2OU9xbwQsctaRCxYW	user	2026-07-03 07:30:22.222504
\.


--
-- Data for Name: violations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.violations (id, "timestamp", label, confidence, camera_source, is_violation, created_at) FROM stdin;
8d0ee87b-a3b6-47a3-8689-f69055d9102a	2026-07-08T17:07:41.988786	chinstrap_bad-strap	0.69	Mac Cam	t	2026-07-08 10:07:42.051298
28583680-d0aa-4aa8-899e-7ad02c19f601	2026-07-08T17:07:42.996855	head	0.54	Mac Cam	t	2026-07-08 10:07:43.062918
1ef190d6-c65b-47d6-ac67-75cadab4cca1	2026-07-08T17:07:59.992192	chinstrap_no-helmet	0.84	Mac Cam	t	2026-07-08 10:08:00.051666
79ed954a-173d-4c76-a58b-7dee220610b5	2026-07-08T17:08:10.984032	head	0.87	Mac Cam	t	2026-07-08 10:08:11.046139
f98d4294-59e1-464a-b261-31cde3c0f087	2026-07-08T17:08:14.002626	NO-Safety Vest	0.46	Mac Cam	t	2026-07-08 10:08:14.072441
ab795ac4-2655-41c1-a8d3-3be4c75813dc	2026-07-08T17:08:18.995916	head	0.74	Mac Cam	t	2026-07-08 10:08:19.055906
6263626b-3fcb-4ff4-885b-306f9f3d53bc	2026-07-08T17:08:32.985229	chinstrap_no-helmet	0.86	Mac Cam	t	2026-07-08 10:08:33.04415
879060f3-574f-47db-9184-f444cb7797f4	2026-07-08T17:08:51.989914	chinstrap_bad-strap	0.58	Mac Cam	t	2026-07-08 10:08:52.05572
3410e58a-8355-4874-b3ff-31948194d185	2026-07-08T17:08:52.976015	NO-Safety Vest	0.57	Mac Cam	t	2026-07-08 10:08:53.08604
dace06ff-dd6b-422a-89c0-8b621b34639d	2026-07-08T17:09:03.992001	NO-Safety Vest	0.48	Mac Cam	t	2026-07-08 10:09:04.07332
686c1ae3-e333-436a-a9bc-718f813f0af4	2026-07-08T17:09:10.984969	NO-Safety Vest	0.54	Mac Cam	t	2026-07-08 10:09:11.044898
48762f13-3d12-4efa-9bab-f9ba35ae2a16	2026-07-08T17:09:16.095125	NO-Safety Vest	0.59	Mac Cam	t	2026-07-08 10:09:16.178807
dfcd9222-461c-4cd9-94e6-60bff6ff310a	2026-07-08T17:09:26.988740	NO-Safety Vest	0.57	Mac Cam	t	2026-07-08 10:09:27.051847
14389141-88b7-409b-836e-dbdda8b9430d	2026-07-08T17:09:33.003906	NO-Safety Vest	0.63	Mac Cam	t	2026-07-08 10:09:33.099787
dd29940d-957f-489f-8418-5010a7f9ce2f	2026-07-08T17:09:49.990718	NO-Safety Vest	0.62	Mac Cam	t	2026-07-08 10:09:50.052888
6ccb1a67-a839-4bb8-9416-f166f6cbb93d	2026-07-08T17:07:32.995235	head	0.69	Mac Cam	t	2026-07-08 10:07:33.062587
b61cbf43-7a6f-454d-864c-823153c6aaf4	2026-07-08T17:07:35.999642	NO-Safety Vest	0.61	Mac Cam	t	2026-07-08 10:07:36.07081
28c2f888-d055-4e40-81ed-38d5c2e8d798	2026-07-08T17:07:47.994740	NO-Safety Vest	0.53	Mac Cam	t	2026-07-08 10:07:48.059758
40392e0c-82af-4266-8dc0-04d0b78e19c0	2026-07-08T17:07:52.009490	chinstrap_no-helmet	0.62	Mac Cam	t	2026-07-08 10:07:52.075621
c45c9a07-1327-41d9-b81f-c39551ef9dbe	2026-07-08T17:08:04.998080	head	0.76	Mac Cam	t	2026-07-08 10:08:05.058839
de8f3279-d102-4b65-917e-52410e0764b3	2026-07-08T17:08:07.987285	chinstrap_no-helmet	0.66	Mac Cam	t	2026-07-08 10:08:08.04858
8223a60a-5e67-455f-8d25-d9948439938f	2026-07-08T17:08:15.995698	chinstrap_no-helmet	0.84	Mac Cam	t	2026-07-08 10:08:16.055679
db70aaaf-17b3-4013-831e-6dc05a2b9620	2026-07-08T17:08:26.992452	chinstrap_no-helmet	0.71	Mac Cam	t	2026-07-08 10:08:27.057616
ea7a7456-154d-410d-9429-d5464e5f1212	2026-07-08T17:08:32.985229	chinstrap_bad-strap	0.77	Mac Cam	t	2026-07-08 10:08:33.282952
966cbfd1-3f9d-4a57-a623-919788692402	2026-07-08T17:08:36.991495	NO-Safety Vest	0.56	Mac Cam	t	2026-07-08 10:08:37.050571
fcbf2aa4-dca6-4d06-8ecd-8d8025168e0f	2026-07-08T17:08:53.990622	chinstrap_no-helmet	0.72	Mac Cam	t	2026-07-08 10:08:54.078991
02fe616a-95cd-4271-9469-4890b2eb63a8	2026-07-08T17:08:58.003766	NO-Safety Vest	0.56	Mac Cam	t	2026-07-08 10:08:58.101835
f2d00b8e-ba26-407f-8acd-aebfab685d04	2026-07-08T17:09:05.990873	chinstrap_no-helmet	0.63	Mac Cam	t	2026-07-08 10:09:06.083304
1e93de2c-aa96-4504-8308-09c55f52b77c	2026-07-08T17:09:07.001135	head	0.61	Mac Cam	t	2026-07-08 10:09:07.103038
14c9fcfa-cc14-4aa6-ae58-56a11a9b3d80	2026-07-08T17:09:07.988129	chinstrap_bad-strap	0.71	Mac Cam	t	2026-07-08 10:09:08.099391
316beb13-45ad-4b65-9776-006f46539399	2026-07-08T17:09:12.991345	head	0.54	Mac Cam	t	2026-07-08 10:09:13.099929
6af7b91d-c3bc-4ba7-ae31-47dc422ecfb6	2026-07-08T17:09:21.981844	NO-Safety Vest	0.57	Mac Cam	t	2026-07-08 10:09:22.047313
9ed540dd-74d0-4827-a205-49f037ef926f	2026-07-08T17:09:38.978882	NO-Safety Vest	0.71	Mac Cam	t	2026-07-08 10:09:39.066084
2dd68d5a-0254-4b31-a5e7-84ef9b8b297b	2026-07-08T17:10:03.976125	head	0.89	Mac Cam	t	2026-07-08 10:10:04.059634
3f7bda0d-687f-4557-a8a8-d94ab22cac68	2026-07-08T17:07:33.997153	chinstrap_bad-strap	0.56	Mac Cam	t	2026-07-08 10:07:34.06031
0a7290af-5e10-425a-8360-b684dae9d865	2026-07-08T17:07:34.999803	chinstrap_no-helmet	0.71	Mac Cam	t	2026-07-08 10:07:35.060002
e2510805-81b3-4340-9703-82d94d81f6b0	2026-07-08T17:07:53.987407	NO-Safety Vest	0.49	Mac Cam	t	2026-07-08 10:07:54.049855
bd4c4a08-fe1f-4902-8958-ec40b269996b	2026-07-08T17:07:57.991376	chinstrap_bad-strap	0.56	Mac Cam	t	2026-07-08 10:07:58.054451
3b6508dd-4197-4543-83e2-560e934da9fd	2026-07-08T17:07:58.996645	head	0.84	Mac Cam	t	2026-07-08 10:07:59.055187
79d2ebfa-e6be-4e69-ae2a-1b2218b20d47	2026-07-08T17:08:04.998080	NO-Safety Vest	0.46	Mac Cam	t	2026-07-08 10:08:05.292641
581faef0-7f9f-4a52-8a70-2f4d659b5918	2026-07-08T17:08:21.994485	chinstrap_no-helmet	0.69	Mac Cam	t	2026-07-08 10:08:22.054536
eefcac30-63bf-451c-a263-9cf1976e7589	2026-07-08T17:08:38.988746	head	0.58	Mac Cam	t	2026-07-08 10:08:39.057332
30bc692e-dd5e-4c29-910c-103bf1fb5398	2026-07-08T17:08:59.992140	head	0.79	Mac Cam	t	2026-07-08 10:09:00.059203
4946b1ce-94c6-446e-b4ec-7fb8747f6de0	2026-07-08T17:09:00.985590	chinstrap_no-helmet	0.83	Mac Cam	t	2026-07-08 10:09:01.08066
be0aff5e-195a-4de7-b08e-b1a4a56207ba	2026-07-08T17:09:44.984586	NO-Safety Vest	0.65	Mac Cam	t	2026-07-08 10:09:45.049957
26c2f328-6153-4d03-badd-90eb129dee56	2026-07-08T17:07:28.001090	chinstrap_no-helmet	0.98	Mac Cam	t	2026-07-08 10:07:29.222961
19cfa792-f7c3-4083-8f6c-c3ce4d529396	2026-07-08T17:07:31.005230	NO-Safety Vest	0.64	Mac Cam	t	2026-07-08 10:07:31.066117
1bc5c41d-af14-4b6c-8553-b9b2f77783d5	2026-07-08T17:09:55.994097	NO-Safety Vest	0.64	Mac Cam	t	2026-07-08 10:09:56.083508
80515040-1c40-49a1-877f-d125125e9e5e	2026-07-08T17:10:03.976125	NO-Safety Vest	0.51	Mac Cam	t	2026-07-08 10:10:04.357393
f3e54e73-7526-4807-b79a-bd30d25d7a7a	2026-07-08T17:10:10.980530	NO-Safety Vest	0.49	Mac Cam	t	2026-07-08 10:10:11.073558
\.


--
-- Name: cameras_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cameras_id_seq', 3, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 2, true);


--
-- Name: cameras cameras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cameras
    ADD CONSTRAINT cameras_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: violations violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.violations
    ADD CONSTRAINT violations_pkey PRIMARY KEY (id);


--
-- Name: cameras fk_cameras_owner; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cameras
    ADD CONSTRAINT fk_cameras_owner FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


