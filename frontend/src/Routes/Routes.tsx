import App from "../App";
import { createBrowserRouter } from "react-router-dom";
import HomePage from "../Pages/MainPage/MainPage";
import FeedbackPage from "../Pages/FeedbackPage/FeedbackPage";
import InterviewPage from "../Pages/InterviewPage/InterviewPage";
import JobDescriptionPage from "../Pages/JobDescriptionPage/JobDescriptionPage";
import PastInterviewsPage from "../Pages/PastInterviewsPage/PastInterviewsPage";
import CharactersPage from "../Pages/CharactersPage/CharactersPage";
import SignInPage from "../Pages/SignInPage/SignInPage";
import ProtectedRoute from "../Components/ProtectedRoute";

export const router = createBrowserRouter([
    {
        path: "/",
        element: <App />,
        children: [
            { path: "/", element: <HomePage /> },
            { path: "signin", element: <SignInPage /> },
            { path: "feedback", element: <ProtectedRoute><FeedbackPage /></ProtectedRoute> },
            { path: "jobdescription", element: <ProtectedRoute><JobDescriptionPage /></ProtectedRoute> },
            { path: "interview", element: <ProtectedRoute><InterviewPage /></ProtectedRoute> },
            { path: "pastinterviews", element: <ProtectedRoute><PastInterviewsPage /></ProtectedRoute> },
            { path: "characters", element: <ProtectedRoute><CharactersPage /></ProtectedRoute> },
        ],
    },
]);
